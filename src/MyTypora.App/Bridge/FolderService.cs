using System.IO;
using System.Text.Json;
using System.Windows;
using Microsoft.Win32;

namespace MyTypora.App.Bridge;

/// <summary>目录树扫描与文件夹选择。</summary>
public sealed class FolderService
{
    private static readonly HashSet<string> IgnoreDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", "node_modules", ".vs", "bin", "obj", "dist", ".idea", "__pycache__",
    };

    public Task<object?> PickFolderAsync(JsonElement _)
    {
        var dlg = new OpenFolderDialog { Title = "打开文件夹" };
        var owner = Application.Current?.MainWindow;
        var ok = dlg.ShowDialog(owner);
        return Task.FromResult<object?>(ok == true ? dlg.FolderName : null);
    }

    /// <summary>返回目录树节点；达到深度上限的目录 children=null，由前端懒加载。</summary>
    public Task<object?> TreeAsync(JsonElement p)
    {
        var root = p.TryGetProperty("path", out var v) ? v.GetString() : null;
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
            throw new ArgumentException("目录不存在");
        var depth = p.TryGetProperty("depth", out var d) && d.ValueKind == JsonValueKind.Number
            ? Math.Clamp(d.GetInt32(), 1, 8)
            : 3;
        return Task.FromResult<object?>(BuildNode(root.TrimEnd(Path.DirectorySeparatorChar), depth));
    }

    private static object BuildNode(string fullPath, int maxDepth)
    {
        var dir = new DirectoryInfo(fullPath);
        var dirs = new List<object>();
        var files = new List<object>();

        if (maxDepth > 1)
        {
            try
            {
                foreach (var sub in dir.EnumerateDirectories())
                {
                    if (IgnoreDirs.Contains(sub.Name) || sub.Name.StartsWith('.')) continue;
                    dirs.Add(BuildNode(sub.FullName, maxDepth - 1));
                }
                foreach (var file in dir.EnumerateFiles())
                {
                    if (file.Name.StartsWith('.')) continue;
                    files.Add(new
                    {
                        name = file.Name,
                        path = file.FullName,
                        type = "file",
                        isMd = IsMd(file.Name),
                        children = (object?)null,
                    });
                }
            }
            catch (UnauthorizedAccessException) { /* 无权限子目录跳过 */ }
            catch (IOException) { }
        }

        return new
        {
            name = dir.Name,
            path = dir.FullName,
            type = "dir",
            isMd = false,
            children = maxDepth > 1
                ? dirs.OrderBy(n => GetName(n), StringComparer.OrdinalIgnoreCase)
                    .Concat(files.OrderBy(n => GetName(n), StringComparer.OrdinalIgnoreCase))
                : null,
        };
    }

    private static string GetName(object node) =>
        (string)(node.GetType().GetProperty("name")!.GetValue(node) ?? string.Empty);

    public static bool IsMd(string name)
    {
        var ext = Path.GetExtension(name);
        return ext is ".md" or ".markdown" or ".mdown" or ".mkd";
    }
}
