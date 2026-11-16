using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MyTypora.App.Bridge;

/// <summary>最近文件（%APPDATA%\MyTypora\recent.json）。</summary>
public sealed class RecentService
{
    private const int MaxItems = 15;

    private static string StorePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FreeMD", "recent.json");

    /// <summary>同步读取（供原生菜单使用）。</summary>
    public string[] ListFiles()
    {
        try
        {
            if (!File.Exists(StorePath)) return [];
            var node = JsonNode.Parse(File.ReadAllText(StorePath));
            return node is JsonArray arr
                ? arr.Where(n => n is not null).Select(n => n!.GetValue<string>()).ToArray()
                : [];
        }
        catch
        {
            return [];
        }
    }

    public void Add(string path)
    {
        var list = ListFiles().ToList();
        list.RemoveAll((p) => string.Equals(p, path, StringComparison.OrdinalIgnoreCase));
        list.Insert(0, path);
        if (list.Count > MaxItems) list = list.Take(MaxItems).ToList();
        Save(list);
    }

    public void ClearAll()
    {
        try { if (File.Exists(StorePath)) File.Delete(StorePath); } catch { /* 忽略 */ }
    }

    private static void Save(List<string> list)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StorePath)!);
            var arr = new JsonArray(list.Select((p) => JsonValue.Create(p)).ToArray());
            File.WriteAllText(StorePath, arr.ToJsonString());
        }
        catch { /* 配置写入失败可忽略 */ }
    }

    // ---- 桥方法 ----

    public Task<object?> ListAsync(JsonElement _) => Task.FromResult<object?>(
        ListFiles().Where(File.Exists).Take(MaxItems).ToArray());

    public Task<object?> AddAsync(JsonElement p)
    {
        var path = p.TryGetProperty("path", out var v) ? v.GetString() : null;
        if (!string.IsNullOrWhiteSpace(path)) Add(path);
        return Task.FromResult<object?>(null);
    }

    public Task<object?> ClearAsync(JsonElement _)
    {
        ClearAll();
        return Task.FromResult<object?>(null);
    }
}
