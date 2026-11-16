using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
using MyTypora.App.Bridge;

namespace MyTypora.App;

public partial class MainWindow : Window
{
    private BridgeHost? _bridge;
    private readonly bool _devMode;

    public MainWindow()
    {
        InitializeComponent();
        // 应用图标（任务栏 / Alt-Tab / 标题栏）
        Icon = System.Windows.Media.Imaging.BitmapFrame.Create(
            new Uri("pack://application:,,,/icon.ico"));

        // 开发模式：设置 MYTYPORA_DEV_URL=http://localhost:5173 走 Vite 热更新
        var devUrl = Environment.GetEnvironmentVariable("MYTYPORA_DEV_URL");
        _devMode = !string.IsNullOrWhiteSpace(devUrl);

        Loaded += async (_, _) => await InitWebViewAsync(devUrl);
        SourceInitialized += (_, _) => WindowHooks.Attach(this);
    }

    private async Task InitWebViewAsync(string? devUrl)
    {
        var dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FreeMD", "WebView2");
        Directory.CreateDirectory(dataDir);

        var options = new CoreWebView2EnvironmentOptions
        {
            // 开发调试口（本机回环），发布版可移除
            AdditionalBrowserArguments = "--remote-debugging-port=9222",
        };
        _environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataDir, options: options);
        await Web.EnsureCoreWebView2Async(_environment);

        var settings = Web.CoreWebView2.Settings;
        settings.AreDevToolsEnabled = _devMode;
        settings.AreDefaultContextMenusEnabled = true;
        settings.IsStatusBarEnabled = false;
        settings.IsZoomControlEnabled = false;
        // Ctrl+S/O/F/P 等交给编辑器自己处理，不触发浏览器行为
        settings.AreBrowserAcceleratorKeysEnabled = false;

        _bridge = new BridgeHost(Web.CoreWebView2)
        {
            SelfTestPath = ResolveSamplePath(),
            SendStartupFiles = SendStartupFiles,
        };
        RegisterWindowCommands();

        if (!string.IsNullOrWhiteSpace(devUrl))
        {
            Web.CoreWebView2.Navigate(devUrl);
            return;
        }

        var wwwroot = ResolveWwwroot();
        if (wwwroot is null)
        {
            Web.CoreWebView2.NavigateToString(
                "<html><body style=\"font-family:sans-serif;padding:48px;color:#333\">" +
                "<h2>缺少前端构建产物</h2>" +
                "<p>请在 <code>web</code> 目录执行：<code>npm install &amp;&amp; npm run build</code>，然后重启应用。</p>" +
                "</body></html>");
            return;
        }

        Web.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "app.local", wwwroot, CoreWebView2HostResourceAccessKind.Allow);
        SetupFsInterceptor();
        Web.CoreWebView2.Navigate("https://app.local/index.html");
    }

    /// <summary>定位前端产物：开发态优先用工程源目录（避免 bin 内过期副本），发布态用输出目录。</summary>
    private static string? ResolveWwwroot()
    {
        foreach (var rel in new[] { Path.Combine("..", "..", "..", "wwwroot"), "wwwroot" })
        {
            var dir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, rel));
            if (File.Exists(Path.Combine(dir, "index.html"))) return dir;
        }
        return null;
    }

    private static string? ResolveSamplePath()
    {
        // 自基目录向上搜索 docs\sample.md（发布态含 Content，开发态在解决方案根）
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 6 && dir is not null; i++, dir = dir.Parent)
        {
            var sample = Path.Combine(dir.FullName, "docs", "sample.md");
            if (File.Exists(sample)) return sample;
        }
        return null;
    }

    private bool _closeApproved;

    /// <summary>窗口级桥命令：关闭确认与全屏切换。</summary>
    private void RegisterWindowCommands()
    {
        _bridge!.Register("app:confirmClose", (p) =>
        {
            var cancel = p.TryGetProperty("cancel", out var c) && c.ValueKind == JsonValueKind.True;
            if (!cancel)
            {
                _closeApproved = true;
                Close();
            }
            return Task.FromResult<object?>(null);
        });

        _bridge.Register("window:setFullscreen", (p) =>
        {
            var on = p.TryGetProperty("on", out var o) && o.ValueKind == JsonValueKind.True;
            WindowState = on ? WindowState.Maximized : WindowState.Normal;
            return Task.FromResult<object?>(null);
        });

        _bridge.Register("window:setTitle", (p) =>
        {
            var title = p.TryGetProperty("title", out var t) ? t.GetString() : null;
            Title = string.IsNullOrWhiteSpace(title) ? "FreeMD" : title;
            return Task.FromResult<object?>(null);
        });

        // fs.local 当前文档目录（由 WebResourceRequested 拦截器使用）
        _bridge.Register("window:mapFs", (p) =>
        {
            var path = p.TryGetProperty("path", out var v) ? v.GetString() : null;
            if (!string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
                _fsFolder = Path.GetFullPath(path);
            return Task.FromResult<object?>(new { mapped = _fsFolder is not null, folder = _fsFolder });
        });

        // 菜单栏主题联动（按主题名应用配色板）
        _bridge.Register("window:setChrome", (p) =>
        {
            var theme = p.TryGetProperty("theme", out var t) ? t.GetString() : null;
            ApplyChromeTheme(theme ?? "github");
            return Task.FromResult<object?>(null);
        });

        // 外部浏览器打开超链接
        _bridge.Register("window:openExternal", (p) =>
        {
            var url = p.TryGetProperty("url", out var v) ? v.GetString() : null;
            if (!string.IsNullOrWhiteSpace(url) &&
                (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                 url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true,
                });
            }
            return Task.FromResult<object?>(null);
        });

        // PDF 导出：web 先切打印样式，稍候 300ms 再打印当前文档
        _bridge.Register("export:printPdf", async (p) =>
        {
            var path = p.TryGetProperty("path", out var v) ? v.GetString() : null;
            if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("缺少导出路径");
            await Task.Delay(300);
            var settings = _environment!.CreatePrintSettings();
            settings.PageWidth = 8.27; // A4
            settings.PageHeight = 11.69;
            settings.MarginTop = 0.6;
            settings.MarginBottom = 0.6;
            settings.MarginLeft = 0.6;
            settings.MarginRight = 0.6;
            settings.ShouldPrintBackgrounds = true;
            settings.ShouldPrintHeaderAndFooter = false;
            await Web.CoreWebView2.PrintToPdfAsync(path, settings);
            return new { ok = true, path };
        });
    }

    private void ApplyChromeTheme(string theme)
    {
        var (chromeBg, menuBg, fg, soft, border) = theme switch
        {
            "dark" => ("#24272E", "#22262B", "#D7DAE0", "#9AA5B5", "#333940"),
            "paper" => ("#F2EDDE", "#F2EDDE", "#3D3830", "#857D6E", "#E4DCC8"),
            _ => ("#FBFBFC", "#FBFBFC", "#3A4150", "#9AA5B5", "#E6E8EC"),
        };
        System.Windows.Media.SolidColorBrush color(string hex) =>
            new System.Windows.Media.SolidColorBrush(
                (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hex));
        TitleBarBorder.Background = color(chromeBg);
        TitleText1.Foreground = color(soft);
        TitleText2.Foreground = color(fg);
        TopMenu.Background = color(menuBg);
        TopMenu.BorderBrush = color(border);
        TopMenu.Foreground = color(fg);
        // 最小化/最大化按钮文字随主题（关闭按钮红底白字由样式触发器控制）
        var btnFg = color(theme == "dark" ? "#C9CCD3" : "#5A5F6A");
        MinBtn.Foreground = btnFg;
        MaxBtn.Foreground = btnFg;
    }

    // ---- fs.local 本地文件拦截服务（图片等文档相对资源） ----

    private CoreWebView2Environment? _environment;
    private volatile string? _fsFolder;

    private static readonly Dictionary<string, string> FsMime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".svg"] = "image/svg+xml",
        [".webp"] = "image/webp",
        [".bmp"] = "image/bmp",
        [".ico"] = "image/x-icon",
        [".avif"] = "image/avif",
        [".pdf"] = "application/pdf",
    };

    /// <summary>拦截 https://fs.local/* 请求，从当前文档目录（_fsFolder）提供本地文件。</summary>
    private void SetupFsInterceptor()
    {
        var core = Web.CoreWebView2;
        core.AddWebResourceRequestedFilter("https://fs.local/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += OnFsWebResourceRequested;
    }

    private void OnFsWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var deferral = e.GetDeferral();
        var root = _fsFolder;
        try
        {
            var uri = new Uri(e.Request.Uri);
            var rel = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/');
            var respond = (int status, string reason, byte[] body, string contentType) =>
                e.Response = _environment!.CreateWebResourceResponse(
                    new MemoryStream(body), status, reason, $"Content-Type: {contentType}");

            if (string.IsNullOrEmpty(root))
            {
                respond(404, "Not Found", "fs.local: no folder mapped"u8.ToArray(), "text/plain");
                return;
            }

            var full = Path.GetFullPath(Path.Combine(root, rel));
            if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase)
                || !File.Exists(full))
            {
                respond(404, "Not Found", "fs.local: not found"u8.ToArray(), "text/plain");
                return;
            }

            var mime = FsMime.TryGetValue(Path.GetExtension(full), out var m) ? m : "application/octet-stream";
            respond(200, "OK", File.ReadAllBytes(full), mime);
        }
        catch
        {
            try
            {
                e.Response = _environment!.CreateWebResourceResponse(
                    new MemoryStream("fs.local: error"u8.ToArray()), 500, "Error", "Content-Type: text/plain");
            }
            catch { /* 宿主已取消则忽略 */ }
        }
        finally
        {
            deferral.Complete();
        }
    }

    private readonly RecentService _recent = new();

    /// <summary>命令行文件参数：页面就绪后打开第一个 .md。</summary>
    private void SendStartupFiles()
    {
        foreach (var arg in Environment.GetCommandLineArgs().Skip(1))
        {
            try
            {
                var full = Path.GetFullPath(arg);
                if (File.Exists(full) && FolderService.IsMd(Path.GetFileName(full)))
                {
                    _bridge?.Send("app:openPath", new { path = full });
                    return;
                }
            }
            catch { /* 非法路径忽略 */ }
        }
    }

    private void RecentMenu_OnOpening(object sender, RoutedEventArgs e)
    {
        RecentMenu.Items.Clear();
        var files = _recent.ListFiles().Where(File.Exists).ToArray();
        if (files.Length == 0)
        {
            RecentMenu.Items.Add(new MenuItem { Header = "（空）", IsEnabled = false });
            return;
        }
        foreach (var f in files)
        {
            var mi = new MenuItem { Header = Path.GetFileName(f), Tag = f };
            mi.Click += RecentFile_Click;
            RecentMenu.Items.Add(mi);
        }
        RecentMenu.Items.Add(new Separator());
        var clear = new MenuItem { Header = "清空最近文件" };
        clear.Click += (_, _) => _recent.ClearAll();
        RecentMenu.Items.Add(clear);
    }

    private void RecentFile_Click(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is string path)
            _bridge?.Send("app:openPath", new { path });
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (!_closeApproved)
        {
            // 交给 web 层判断未保存更改后再确认关闭
            e.Cancel = true;
            _bridge?.Send("app:close-requested");
            return;
        }
        base.OnClosing(e);
    }

    private void MenuCmd(object sender, RoutedEventArgs e)
    {
        if ((sender as FrameworkElement)?.Tag is not string id) return;
        if (id == "app.exit")
        {
            Close();
            return;
        }
        _bridge?.Send("menu:command", new { id });
    }

    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void OnMaximize(object sender, RoutedEventArgs e) =>
        WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;

    private void OnClose(object sender, RoutedEventArgs e) => Close();
}
