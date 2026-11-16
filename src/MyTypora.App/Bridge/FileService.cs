using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using Microsoft.Win32;

namespace MyTypora.App.Bridge;

/// <summary>文件读写（编码检测 / CRLF 保留 / 原子写）与文件对话框。</summary>
public sealed class FileService
{
    public async Task<object?> ReadAsync(JsonElement p)
    {
        var path = RequirePath(p);
        if (!File.Exists(path)) throw new FileNotFoundException("文件不存在", path);

        var bytes = await File.ReadAllBytesAsync(path);
        var (text, encoding, bom) = Decode(bytes);
        var eol = text.Contains("\r\n", StringComparison.Ordinal) ? "crlf" : "lf";
        return new { text, encoding, bom, eol, size = bytes.Length, mtime = MTime(path) };
    }

    public async Task<object?> WriteAsync(JsonElement p)
    {
        var path = RequirePath(p);
        var text = p.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String
            ? t.GetString() ?? string.Empty
            : string.Empty;
        var encodingName = p.TryGetProperty("encoding", out var enc) && enc.ValueKind == JsonValueKind.String
            ? enc.GetString()
            : null;
        var bom = p.TryGetProperty("bom", out var b) && b.ValueKind == JsonValueKind.True;

        var encoding = ResolveEncoding(encodingName, bom);

        // 原子写：先写临时文件，再替换目标
        var tmp = $"{path}.mytmp-{Guid.NewGuid():N}";
        try
        {
            await using var stream = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None);
            await using var writer = new StreamWriter(stream, encoding);
            await writer.WriteAsync(text);
            await writer.FlushAsync();
        }
        catch
        {
            try { File.Delete(tmp); } catch { /* 清理失败可忽略 */ }
            throw;
        }
        File.Move(tmp, path, overwrite: true);
        return new { mtime = MTime(path) };
    }

    /// <summary>保存剪贴板/拖入的图片（base64）到文档旁 assets 目录。</summary>
    public async Task<object?> WriteBase64Async(JsonElement p)
    {
        var dir = p.TryGetProperty("dir", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null;
        var name = p.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null;
        var base64 = p.TryGetProperty("base64", out var b) && b.ValueKind == JsonValueKind.String ? b.GetString() : null;
        if (string.IsNullOrWhiteSpace(dir) || string.IsNullOrWhiteSpace(name) || string.IsNullOrEmpty(base64))
            throw new ArgumentException("参数不完整");

        var safeName = string.Join("_", name.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries));
        if (safeName.Length == 0) safeName = $"image-{DateTime.Now:yyyyMMdd-HHmmss}";
        if (!Path.HasExtension(safeName)) safeName += ".png";

        Directory.CreateDirectory(dir);
        var full = Path.Combine(dir, safeName);
        var bytes = Convert.FromBase64String(base64);
        await File.WriteAllBytesAsync(full, bytes);
        return new { path = full, name = safeName, relPath = "./assets/" + safeName, size = bytes.Length };
    }

    public Task<object?> PickOpenFileAsync(JsonElement _)
    {
        var dlg = new OpenFileDialog
        {
            Title = "打开 Markdown 文件",
            Filter = "Markdown 文件|*.md;*.markdown;*.mdown;*.mkd|文本文件|*.txt|所有文件|*.*",
            CheckFileExists = true,
        };
        return ShowDialog(dlg);
    }

    public Task<object?> PickSaveFileAsync(JsonElement p)
    {
        var suggested = p.TryGetProperty("suggestedName", out var s) && s.ValueKind == JsonValueKind.String
            ? s.GetString()
            : null;
        var defaultExt = p.TryGetProperty("defaultExt", out var e) && e.ValueKind == JsonValueKind.String
            ? e.GetString()
            : null;
        var filterName = p.TryGetProperty("filterName", out var f) && f.ValueKind == JsonValueKind.String
            ? f.GetString()
            : null;
        var ext = defaultExt ?? "md";
        var dlg = new SaveFileDialog
        {
            Title = "保存文件",
            Filter = ext == "md"
                ? "Markdown 文件|*.md;*.markdown|所有文件|*.*"
                : $"{filterName ?? ext.ToUpper()}|*.{ext}|所有文件|*.*",
            DefaultExt = ext,
            FileName = suggested ?? (ext == "md" ? "未命名" : $"未命名.{ext}"),
        };
        return ShowDialog(dlg);
    }

    /// <summary>自测回路：web 把读取结果回报到本地文件，供自动化验证桥接是否打通。</summary>
    public Task<object?> ReportAsync(JsonElement p)
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FreeMD");
        Directory.CreateDirectory(dir);
        var report = new JsonObject
        {
            ["time"] = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            ["ok"] = p.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True,
            ["detail"] = p.TryGetProperty("detail", out var d) ? d.GetString() : null,
        };
        File.WriteAllText(Path.Combine(dir, "bridge-report.json"), report.ToJsonString());
        return Task.FromResult<object?>(null);
    }

    private static Task<object?> ShowDialog(FileDialog dlg)
    {
        var owner = Application.Current?.MainWindow;
        var ok = dlg.ShowDialog(owner);
        return Task.FromResult<object?>(ok == true ? dlg.FileName : null);
    }

    private static string RequirePath(JsonElement p)
    {
        if (!p.TryGetProperty("path", out var v) || v.ValueKind != JsonValueKind.String)
            throw new ArgumentException("缺少 path 参数");
        var path = v.GetString();
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("path 为空");
        return Path.GetFullPath(path);
    }

    private static string MTime(string path) => File.GetLastWriteTimeUtc(path).ToString("o");

    /// <summary>按 BOM / 严格 UTF-8 试解码 / GB18030 兜底识别编码。</summary>
    private static (string text, string encoding, bool bom) Decode(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
            return (new UTF8Encoding(false).GetString(bytes, 3, bytes.Length - 3), "utf-8-bom", true);
        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
            return (Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2), "utf-16le", true);
        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
            return (Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2), "utf-16be", true);

        try
        {
            var strict = new UTF8Encoding(false, true);
            return (strict.GetString(bytes), "utf-8", false);
        }
        catch (DecoderFallbackException)
        {
            return (Encoding.GetEncoding("GB18030").GetString(bytes), "gb18030", false);
        }
    }

    private static Encoding ResolveEncoding(string? name, bool bom) => name switch
    {
        "utf-8-bom" => new UTF8Encoding(encoderShouldEmitUTF8Identifier: true),
        "utf-16le" => new UnicodeEncoding(bigEndian: false, byteOrderMark: bom),
        "utf-16be" => new UnicodeEncoding(bigEndian: true, byteOrderMark: bom),
        "gb18030" => Encoding.GetEncoding("GB18030"),
        _ => new UTF8Encoding(bom),
    };
}
