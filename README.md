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
  -V, --version           output the version number
  -d, --dir <path>        需要清理的文件夹路径
  -m, --mode <string>     操作模式，复制[cp]，移动[mv]，查看[ls] (default: "ls")
  -t, --timeout <number>  过期天数，不小于90 (default: 90)
  -f, --force <boolean>   强制使用小于90天的参数 (default: false)
  -l, --log <boolean>     输出日志 (default: true)
  -v, --verb <boolean>    输出详细日志 (default: false)
  -h, --help              output usage information
```
