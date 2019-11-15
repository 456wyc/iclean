# iclean 清理工具
过期文件清理工具

将指定目录下的名称符合条件且修改日期超过指定世界的目录移动到该目录下`_trash`目录


## 安装
`npm install -g @tinoq/iclean`

## 运行
查看帮助

`iclean -h`

```
Usage: iclean [options]

Options:
  -V, --version              output the version number
  -s, --src <path>           【必要】需要清理的文件夹路径
  -d, --dest <path>          【必要】文件转移位置
  -m, --mode <string>        操作模式，复制[cp]，移动[mv]，查看[ls] (default: "ls")
  -t, --timeout <number>     过期天数，不小于90 (default: 90)
  -r, --retain <number>      已删除文件保留天数，不小于7 (default: 15)
  -f, --force <boolean>      当传入的 timeout，retain 小于限制的值时，强制使用 (default: false)
  -l, --log <boolean>        输出日志 (default: true)
  -v, --verb <boolean>       输出详细日志 (default: false)
  -o, --onlytrash <boolean>  只清理回收站 (default: false)
  -c, --confirm <boolean>    自动确认按参数执行，适用于自动化脚本 (default: false)
  -h, --help                 output usage information
```
