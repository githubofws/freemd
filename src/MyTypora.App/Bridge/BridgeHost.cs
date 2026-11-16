using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;

namespace MyTypora.App.Bridge;

/// <summary>
/// Web ⇄ 原生 JSON 消息桥。
/// 协议：请求 {id, method, params} → 响应 {id, ok, result | error.message}；
/// 事件：{event, payload}（C# → web 单向推送）。
/// </summary>
public sealed class BridgeHost
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly CoreWebView2 _webview;
    private readonly System.Windows.Threading.Dispatcher _dispatcher;
    private readonly Dictionary<string, Func<JsonElement, Task<object?>>> _handlers = new();

    /// <summary>自测样例文件路径（非空时，页面就绪后下发 app:selftest 事件）。</summary>
    public string? SelfTestPath { get; set; }

    public BridgeHost(CoreWebView2 webview)
    {
        _webview = webview;
        _dispatcher = System.Windows.Threading.Dispatcher.FromThread(Thread.CurrentThread)
            ?? System.Windows.Threading.Dispatcher.CurrentDispatcher;
        webview.WebMessageReceived += OnWebMessageReceived;

        Register("sys:ping", PingAsync);
        Register("sys:ready", OnReadyAsync);

        var files = new FileService();
        Register("sys:report", files.ReportAsync);
        Register("file:read", files.ReadAsync);
        Register("file:write", files.WriteAsync);
        Register("file:writeBase64", files.WriteBase64Async);
        Register("dialog:pickOpenFile", files.PickOpenFileAsync);
        Register("dialog:pickSaveFile", files.PickSaveFileAsync);

        var dialogs = new DialogService();
        Register("dialog:confirm", dialogs.ConfirmAsync);
        Register("dialog:alert", dialogs.AlertAsync);

        var folders = new FolderService();
        Register("folder:pick", folders.PickFolderAsync);
        Register("folder:tree", folders.TreeAsync);

        var watcher = new WatcherService(this);
        Register("watch:start", watcher.StartAsync);
        Register("watch:stop", watcher.StopAsync);
        Register("watch:stopAll", watcher.StopAllAsync);

        var recent = new RecentService();
        Register("recent:list", recent.ListAsync);
        Register("recent:add", recent.AddAsync);
        Register("recent:clear", recent.ClearAsync);

        var settings = new SettingsService();
        Register("settings:get", settings.GetAllAsync);
        Register("settings:save", settings.SaveAsync);
    }

    /// <summary>注册方法处理器（供宿主窗口挂载窗口级命令，如 app:confirmClose）。</summary>
    public void Register(string method, Func<JsonElement, Task<object?>> handler) =>
        _handlers[method] = handler;

    private static Task<object?> PingAsync(JsonElement _) => Task.FromResult<object?>(new
    {
        app = "FreeMD",
        version = typeof(BridgeHost).Assembly.GetName().Version?.ToString(3) ?? "0.1.0",
        os = Environment.OSVersion.VersionString,
    });

    private Task<object?> OnReadyAsync(JsonElement _)
    {
        if (SelfTestPath is not null)
            Send("app:selftest", new { path = SelfTestPath });
        SendStartupFiles?.Invoke();
        return Task.FromResult<object?>(null);
    }

    /// <summary>页面就绪后回调（宿主用它下发命令行文件参数）。</summary>
    public Action? SendStartupFiles { get; set; }

    /// <summary>C# → web 推送事件（自动封送到 UI 线程，允许任意线程调用）。</summary>
    public void Send(string eventName, object? payload = null)
    {
        var msg = new JsonObject
        {
            ["event"] = eventName,
            ["payload"] = payload is null ? null : JsonSerializer.SerializeToNode(payload, JsonOpts),
        };
        var json = msg.ToJsonString(JsonOpts);
        _dispatcher.BeginInvoke(() => _webview.PostWebMessageAsJson(json));
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        long id = 0;
        try
        {
            var msg = JsonNode.Parse(e.WebMessageAsJson) as JsonObject;
            if (msg is null) return;

            id = msg["id"]?.GetValue<long>() ?? 0;
            var method = msg["method"]?.GetValue<string>();
            if (method is null || !_handlers.TryGetValue(method, out var handler))
            {
                Reply(id, ok: false, error: $"未知方法: {method ?? "(空)"}");
                return;
            }

            var element = msg["params"] is JsonNode pn
                ? JsonSerializer.SerializeToElement(pn, JsonOpts)
                : default;
            var result = await handler(element);
            Reply(id, ok: true, result: result);
        }
        catch (Exception ex)
        {
            Reply(id, ok: false, error: ex.Message);
        }
    }

    private void Reply(long id, bool ok, object? result = null, string? error = null)
    {
        var msg = new JsonObject { ["id"] = id, ["ok"] = ok };
        if (ok)
            msg["result"] = result is null ? null : JsonSerializer.SerializeToNode(result, JsonOpts);
        else
            msg["error"] = new JsonObject { ["message"] = error ?? "未知错误" };
        _webview.PostWebMessageAsJson(msg.ToJsonString(JsonOpts));
    }
}
