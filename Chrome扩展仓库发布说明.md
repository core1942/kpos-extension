# POS License Header Helper - Chrome 扩展仓库发布说明

## 基本信息

**扩展名称**

POS License Header Helper

**一句话简介**

为公司内部 KPOS 系统的授权接口自动添加客户端身份请求头。

**简短说明**

POS License Header Helper 用于公司内部局域网 KPOS 系统，在访问指定业务页面后，仅为当前标签页内 `/kpos/api` 开头的接口请求自动添加客户端授权头，帮助 POS、点餐屏和自助点餐设备完成客户端授权绑定。

## 详细说明

POS License Header Helper 是面向公司内部 KPOS 系统的浏览器扩展，适用于 Chrome 和 Edge 浏览器。插件用于在访问指定 KPOS 页面时识别当前客户端身份，并为对应的 KPOS API 请求添加授权所需的请求头。

插件默认支持以下 KPOS 页面：

- `/kpos/front/myhome.html`
- `/kpos/emenu/index.html`
- `/kpos/kiosklite`

当当前标签页命中已配置的激活路径后，插件会根据配置进入客户端模式或运维模式。

在客户端模式下，插件会先调用当前站点的 `/kpos/api/client/overview` 接口检测设备是否已绑定。如设备未绑定，插件会展示设备注册页面，用户可填写设备名称、设备序列号和使用区域。注册成功后，插件会继续访问原目标页面，并为该标签页内 `/kpos/api` 开头的接口请求添加：

- `X-Client-Sn`
- `X-Client-Type`

在运维模式下，插件会使用配置的运维 SN 和当前路径对应的 type，为 `/kpos/api` 请求添加相同的客户端身份头。

插件提供弹出页和完整配置页，可查看当前页面是否生效、查看当前 SN/type、执行客户端解绑，并维护可激活插件的 path、SN、type 和运行模式。

本扩展仅用于公司内部系统，不面向公共互联网通用网站提供功能。

## 主要功能

- 自动生成并保存浏览器端设备标识。
- 根据配置 path 判断插件是否对当前标签页生效。
- 客户端模式下自动检测设备授权状态。
- 未绑定设备可通过扩展内注册页完成绑定。
- 仅对当前已激活标签页内 `/kpos/api` 开头的请求添加授权头。
- 静态资源、普通页面、iframe 页面本身不添加客户端授权头。
- 支持客户端模式与运维模式切换。
- 支持自定义 path、SN 和 type。
- 支持调用内部接口解绑当前客户端。
- 检测到客户端授权失效时，可重新进入注册流程。

## 使用说明

1. 安装扩展后，打开公司内部 KPOS 系统页面。
2. 当页面路径命中扩展配置的激活 path 时，插件会自动检查设备授权状态。
3. 如设备未注册，按注册页面提示填写设备名称、设备序列号和使用区域。
4. 注册成功后返回 KPOS 页面，后续 `/kpos/api` 请求会自动携带授权头。
5. 如需调整 path、SN、type 或运行模式，可点击扩展图标进入弹出页，再进入完整配置页修改。
6. 如需解绑当前客户端，可在扩展弹出页点击“解绑”。

## 权限用途说明

**declarativeNetRequest / declarativeNetRequestWithHostAccess**

用于在当前已激活标签页内，为 `/kpos/api` 开头的接口请求添加 `X-Client-Sn` 和 `X-Client-Type` 请求头。

**storage**

用于保存扩展配置，包括运行模式、设备 ID、浏览器类型、默认 SN、path 配置、SN 和 type。

**tabs**

用于识别当前标签页 URL，判断是否命中配置的 KPOS 激活路径，并在注册完成后返回原目标页面。

**webNavigation**

用于监听标签页主页面导航，在用户进入指定 KPOS path 时启动授权检测流程。

**webRequest**

用于监听 KPOS API 的 401 响应，以便在客户端授权失效时重新进入注册流程。

**host_permissions: `<all_urls>`**

插件需要适配不同内网部署域名、IP 地址和端口，因此使用通配 host 权限。插件实际只在命中用户配置的 KPOS path 后生效，并且只为当前标签页内 `/kpos/api` 开头的请求添加授权头。

## 隐私说明

本扩展不会收集、出售或向第三方传输用户个人信息。

扩展会在浏览器本地保存以下配置数据：

- 本地生成的设备 ID。
- 浏览器类型。
- 设备 SN。
- KPOS path 配置。
- 客户端 type。
- 插件运行模式。

这些数据存储在浏览器本地扩展存储中，用于完成公司内部 KPOS 系统客户端授权流程。

扩展仅会与当前访问的公司内部 KPOS 站点交互，调用以下内部接口：

- `/kpos/api/client/overview`
- `/kpos/api/client/register`
- `/kpos/api/client/unbind`

扩展不会将数据发送到开发者自有服务器或任何第三方分析平台。

## 单一用途说明

本扩展的唯一用途是：在公司内部 KPOS 系统中，为已配置的客户端授权接口请求添加客户端身份请求头，并辅助完成客户端授权绑定、解绑和重新注册流程。

## 发布备注

当前版本：`0.1.1`

本版本为公司内部 KPOS 授权头辅助扩展，主要用于 POS、电子菜单和自助点餐终端的浏览器访问场景。

更新内容：

- 支持客户端模式和运维模式。
- 支持默认 KPOS path 配置。
- 支持自定义 path、SN 和 type。
- 支持客户端授权检测和注册。
- 支持仅对 `/kpos/api` 接口请求添加授权头。
- 支持客户端解绑和授权失效后的重新注册流程。

## 审核补充说明

该扩展仅用于企业内部局域网业务系统。由于客户内网部署域名、IP 和端口可能不同，扩展需要 `<all_urls>` host 权限来兼容不同部署环境。扩展不会在所有网站上主动执行授权逻辑，只有当当前标签页 URL 命中用户配置的 KPOS path 时才会激活，并且请求头注入范围限制为当前标签页内 `/kpos/api` 开头的请求。

扩展不会读取网页内容用于分析、广告、追踪或第三方传输。扩展监听页面请求的目的仅限于识别客户端授权失效响应，并引导用户重新完成公司内部客户端注册流程。

## Chrome Web Store 隐私权规范填写模板

以下内容用于处理发布后台“无法发布”页面列出的必填项。可以按字段复制到 Chrome Web Store 的“隐私权规范”标签页中。

### 单一用途说明

本扩展的唯一用途是服务公司内部 KPOS 系统客户端授权流程：当用户访问已配置的 KPOS 业务页面时，扩展会识别当前标签页是否需要客户端授权，并仅为该标签页内 `/kpos/api` 开头的接口请求添加 `X-Client-Sn` 与 `X-Client-Type` 请求头。扩展同时提供设备授权检测、注册、解绑和授权失效后重新注册能力。

### 远程代码使用说明

本扩展不使用远程代码。所有 JavaScript、HTML、CSS 和配置文件均随扩展包一起发布。扩展会调用公司内部 KPOS API 完成授权状态检测、设备注册和解绑，但不会从远程服务器下载、加载或执行任何 JavaScript、WASM、插件代码或可执行代码。

### host 权限使用理由

公司内部 KPOS 系统可能部署在不同客户或门店的内网域名、IP 地址和端口上，无法在发布时枚举固定域名，因此需要 `<all_urls>` host 权限来兼容不同部署环境。扩展实际只会在当前标签页 URL 命中用户配置的 KPOS 激活路径后生效，并且请求头注入范围限制为当前标签页内 `/kpos/api` 开头的请求。扩展不会对普通网站执行授权逻辑，也不会为静态资源、普通页面或 iframe 页面本身添加请求头。

### declarativeNetRequest 权限使用理由

扩展使用 `declarativeNetRequest` 在浏览器网络层为当前已激活标签页内 `/kpos/api` 开头的接口请求添加 `X-Client-Sn` 和 `X-Client-Type` 请求头。该能力用于 KPOS 后端识别客户端授权身份。使用声明式网络规则可以避免在页面业务代码中修改每个请求，并将请求头注入限制在明确的 URL 范围内。

### declarativeNetRequestWithHostAccess 权限使用理由

扩展需要在不同内网域名、IP 和端口的 KPOS 站点上应用声明式请求头修改规则，因此需要 `declarativeNetRequestWithHostAccess` 结合 host 权限对匹配站点生效。扩展只在命中配置 path 的标签页内启用该规则，并且只匹配 `/kpos/api` 开头的接口请求。

### storage 权限使用理由

扩展使用 `storage` 在浏览器本地保存插件配置，包括运行模式、设备 ID、浏览器类型、默认 SN、KPOS path 配置、客户端 type 和用户配置的 SN。这些数据仅用于 KPOS 客户端授权流程，保存在用户本地浏览器中，不会发送给第三方。

### tabs 权限使用理由

扩展使用 `tabs` 读取当前标签页 URL，以判断页面是否命中已配置的 KPOS 激活 path；在设备注册完成后，扩展还需要将当前标签页跳转回原始 KPOS 目标页面。扩展不会读取或记录用户的浏览历史。

### webNavigation 权限使用理由

扩展使用 `webNavigation` 监听当前标签页的主页面导航事件。当用户进入已配置的 KPOS path 时，扩展会启动授权检测流程，并在授权通过后启用 `/kpos/api` 请求头注入规则。

### webRequest 权限使用理由

扩展使用 `webRequest` 监听当前已激活标签页内 KPOS API 请求的 401 响应。当后端返回客户端未授权或授权失效时，扩展会引导用户重新进入设备注册流程。扩展不会使用该权限收集、出售或分析用户浏览数据。

### 数据使用情况确认

本扩展不会收集、出售或向第三方共享用户个人信息。扩展只在浏览器本地保存 KPOS 客户端授权所需的配置数据，并只与当前访问的公司内部 KPOS 站点交互，用于调用 `/kpos/api/client/overview`、`/kpos/api/client/register` 和 `/kpos/api/client/unbind`。扩展不会将数据发送到开发者自有服务器或第三方分析、广告、追踪平台。

### 发布方联系邮箱

请在 Chrome Web Store 开发者后台“设置”页面填写并验证发布方联系邮箱。该邮箱应使用公司或项目维护团队邮箱，例如：`support@example.com` 或实际负责 KPOS 插件维护的邮箱。填写后需要按 Google 邮件中的验证流程完成验证，否则无法发布。

### 隐私权政策网址

如果使用本项目生成的 GitHub Pages 页面，请在 GitHub 仓库 `Settings` -> `Pages` 中选择 `main` 分支和 `/docs` 目录发布。发布成功后，在 Chrome Web Store 的“隐私权政策网址”中填写：

```text
https://<github-user-or-org>.github.io/<repository-name>/privacy/pos-license-header-helper/
```

如果仓库是 GitHub 用户或组织主页仓库，则填写：

```text
https://<github-user-or-org>.github.io/privacy/pos-license-header-helper/
```
