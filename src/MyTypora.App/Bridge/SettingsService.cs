using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace MyTypora.App.Bridge;

/// <summary>应用设置持久化（%APPDATA%\MyTypora\settings.json）。</summary>
public sealed class SettingsService
{
    private static string StorePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FreeMD", "settings.json");

    private static readonly object Lock = new();

    public Task<object?> GetAllAsync(JsonElement _)
    {
        lock (Lock)
        {
            return Task.FromResult<object?>(ReadAll());
        }
    }

    /// <summary>合并保存：传入对象整体合并进现有设置。</summary>
    public Task<object?> SaveAsync(JsonElement p)
    {
        if (p.TryGetProperty("values", out var values) && values.ValueKind == JsonValueKind.Object)
        {
            lock (Lock)
            {
                var all = ReadAll();
                foreach (var prop in values.EnumerateObject())
                {
                    all[prop.Name] = JsonSerializer.SerializeToNode(prop.Value, new JsonSerializerOptions());
                }
                Save(all);
            }
        }
        return Task.FromResult<object?>(null);
    }

    private static JsonObject ReadAll()
    {
        try
        {
            if (File.Exists(StorePath) && JsonNode.Parse(File.ReadAllText(StorePath)) is JsonObject obj)
                return obj;
        }
        catch { /* 损坏则重置 */ }
        return new JsonObject();
    }

    private static void Save(JsonObject all)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StorePath)!);
            File.WriteAllText(StorePath, all.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { /* 写失败可忽略 */ }
    }
}
