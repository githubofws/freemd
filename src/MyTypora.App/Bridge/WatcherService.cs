using System.IO;
using System.Text.Json;

namespace MyTypora.App.Bridge;

/// <summary>监听已打开文件的外部修改，防抖后通过 file:external-change 事件通知前端。</summary>
public sealed class WatcherService
{
    private sealed class WatchEntry
    {
        public string Path = "";
        public FileSystemWatcher? Watcher;
        public System.Timers.Timer? Debounce;
    }

    private readonly BridgeHost _bridge;
    private readonly Dictionary<string, WatchEntry> _entries = new(StringComparer.OrdinalIgnoreCase);

    public WatcherService(BridgeHost bridge) => _bridge = bridge;

    public Task<object?> StartAsync(JsonElement p)
    {
        var path = p.TryGetProperty("path", out var v) ? v.GetString() : null;
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            throw new ArgumentException("监听目标不存在");
        StopInternal(path);

        var dir = Path.GetDirectoryName(path) ?? ".";
        var entry = new WatchEntry { Path = path };
        var watcher = new FileSystemWatcher(dir, Path.GetFileName(path))
        {
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.Size | NotifyFilters.CreationTime,
            EnableRaisingEvents = true,
        };
        watcher.Changed += (_, _) => OnChanged(entry);
        watcher.Error += (_, _) => StopInternal(path);
        entry.Watcher = watcher;
        _entries[path] = entry;
        return Task.FromResult<object?>(null);
    }

    public Task<object?> StopAsync(JsonElement p)
    {
        var path = p.TryGetProperty("path", out var v) ? v.GetString() : null;
        if (!string.IsNullOrWhiteSpace(path)) StopInternal(path);
        return Task.FromResult<object?>(null);
    }

    public Task<object?> StopAllAsync(JsonElement _)
    {
        foreach (var path in _entries.Keys.ToList()) StopInternal(path);
        return Task.FromResult<object?>(null);
    }

    private void StopInternal(string path)
    {
        if (!_entries.Remove(path, out var entry)) return;
        entry.Watcher?.Dispose();
        lock (entry)
        {
            entry.Debounce?.Dispose();
            entry.Debounce = null;
        }
    }

    private void OnChanged(WatchEntry entry)
    {
        lock (entry)
        {
            if (entry.Debounce is null)
            {
                var t = new System.Timers.Timer(400) { AutoReset = false };
                t.Elapsed += (_, _) =>
                {
                    lock (entry)
                    {
                        entry.Debounce?.Dispose();
                        entry.Debounce = null;
                    }
                    try
                    {
                        if (File.Exists(entry.Path))
                            _bridge.Send("file:external-change", new { path = entry.Path });
                    }
                    catch { /* 回调期文件被占用则忽略 */ }
                };
                entry.Debounce = t;
                t.Start();
            }
            else
            {
                // 重置防抖窗口
                entry.Debounce.Stop();
                entry.Debounce.Start();
            }
        }
    }
}
