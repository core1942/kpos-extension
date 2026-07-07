# POS License 浏览器插件

这是一个适用于 Chrome / Edge 的 Manifest V3 浏览器插件，用于在命中指定 KPOS path 时，为当前标签页内 `/kpos/api` 开头的请求添加客户端授权头：

- `X-Client-Sn`
- `X-Client-Type`

插件默认处于客户端模式，默认激活 path 与类型：

| Path | Type |
| --- | --- |
| `/kpos/front/myhome.html` | `0` |
| `/kpos/emenu/index.html` | `1` |
| `/kpos/kiosklite` | `14` |

## 功能

- 首次安装生成稳定 `deviceId`，并拼接默认 SN：`BOWSER-${deviceId}-${browserType}`。
- 仅在配置的 path 命中时激活插件。
- 客户端模式下，进入目标页面前调用当前域名的 `/kpos/api/client/overview?sn=...&type=...`。
- 未绑定或接口异常时进入注册页，注册成功后回到原页面。
- 运维模式下，命中 path 后使用 `device001` 作为默认 SN，type 使用 path 配置值。
- 使用 `declarativeNetRequest` 为当前标签页内 `/kpos/api` 开头的请求添加请求头；页面本身、iframe 和静态资源不添加请求头。
- popup 展示当前页是否生效，以及生效时的 SN/type，并提供解绑按钮。
- 完整配置页支持切换模式、新增/修改/删除 path、SN、type。
- 监听 `401` 且响应体 `code=40103` 的 fetch/XHR 响应，重新进入注册流程；对 KPOS API 的 401 响应也有后台兜底处理。

## 安装调试

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展”。
4. 选择本目录：`C:\Users\13715\Desktop\kpos-extension`。

## 默认配置

默认模式与默认 path 来自 `config/defaults.json`。如果需要调整安装包默认值，可以在加载扩展前修改该文件。

## 浏览器限制

普通浏览器扩展无法读取 Windows 真实计算机名；注册页中的默认设备名称使用浏览器类型与生成的 `deviceId` 前缀组合。用户仍可在注册窗口中手动修改设备名称。
