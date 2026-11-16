using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace MyTypora.App;

/// <summary>
/// 无边框窗口（WindowChrome）最大化遮住任务栏的修正：
/// 处理 WM_GETMINMAXINFO，把最大化尺寸限制到显示器工作区。
/// </summary>
internal static class WindowHooks
{
    private const int WmGetMinMaxInfo = 0x0024;
    private const int MonitorDefaultToNearest = 2;

    public static void Attach(Window window)
    {
        var source = (HwndSource?)PresentationSource.FromVisual(window);
        source?.AddHook(WndProc);
    }

    private static IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg != WmGetMinMaxInfo) return IntPtr.Zero;

        var mmi = Marshal.PtrToStructure<MINMAXINFO>(lParam);
        var monitor = MonitorFromWindow(hwnd, MonitorDefaultToNearest);
        if (monitor != IntPtr.Zero)
        {
            var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (GetMonitorInfo(monitor, ref info))
            {
                mmi.ptMaxPosition.x = Math.Abs(info.rcWork.left - info.rcMonitor.left);
                mmi.ptMaxPosition.y = Math.Abs(info.rcWork.top - info.rcMonitor.top);
                mmi.ptMaxSize.x = Math.Abs(info.rcWork.right - info.rcWork.left);
                mmi.ptMaxSize.y = Math.Abs(info.rcWork.bottom - info.rcWork.top);
                Marshal.StructureToPtr(mmi, lParam, true);
                handled = true;
            }
        }
        return IntPtr.Zero;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x, y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int left, top, right, bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public int dwFlags;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, int flags);

    [DllImport("user32.dll")]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);
}
