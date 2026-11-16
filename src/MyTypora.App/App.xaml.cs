using System.Text;
using System.Windows;

namespace MyTypora.App;

public partial class App : Application
{
    public App()
    {
        // .NET(Core) 默认不含 GB18030/GBK 等代码页，需显式注册
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }
}
