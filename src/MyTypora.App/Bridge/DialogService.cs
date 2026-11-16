using System.Text.Json;
using System.Windows;

namespace MyTypora.App.Bridge;

/// <summary>原生对话框：确认 / 提示。</summary>
public sealed class DialogService
{
    public Task<object?> ConfirmAsync(JsonElement p)
    {
        var (title, message) = ReadTitleMessage(p);
        var owner = Application.Current?.MainWindow;
        var result = MessageBox.Show(owner, message, title, MessageBoxButton.YesNo, MessageBoxImage.Warning);
        return Task.FromResult<object?>(result == MessageBoxResult.Yes);
    }

    public Task<object?> AlertAsync(JsonElement p)
    {
        var (title, message) = ReadTitleMessage(p);
        var owner = Application.Current?.MainWindow;
        MessageBox.Show(owner, message, title, MessageBoxButton.OK, MessageBoxImage.Information);
        return Task.FromResult<object?>(null);
    }

    private static (string title, string message) ReadTitleMessage(JsonElement p) => (
        p.TryGetProperty("title", out var t) ? t.GetString() ?? "FreeMD" : "FreeMD",
        p.TryGetProperty("message", out var m) ? m.GetString() ?? string.Empty : string.Empty
    );
}
