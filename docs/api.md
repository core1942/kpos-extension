# 客户端授权池管理接口文档

> 基于 `com.wisdomount.config.controller.LicenseClientController` —— 门店客户端授权池绑定 / 管理
> 设计文档：`docs/modules/pos-config/archive/legacy-migration/phase2-design/license/01-design.md`

## 通用约定

- **Base Path**：`/kpos/api/client`（pos-web `context-path=/kpos/api` + Controller `@RequestMapping("/client")`）
- **响应包装**：所有接口均返回 `Response<T>`
  ```json
  { "code": 0, "msg": "success", "data": { ... } }
  ```
  - `code=0` 表示成功，非 0 为业务错误；`data` 为实际业务数据
- **客户端身份头部**：除白名单接口外，每个请求都必须带 `X-Client-Sn` 与 `X-Client-Type`（未命中已注册池直接 401）
  - **白名单**（无需 header）：`/kpos/api/client/overview`、`/kpos/api/client/register`、`/kpos/api/client/session/login`、无查询参数的 `/kpos/api/client/list`
  - 其余接口（`/current`、`/all`、`/page`、带查询参数的 `/list`、`/update`、`/delete`、`/unbind`）需要带 header
- **dev profile**：开启 `dev` profile 时，未带 header 会被 `DevDefaultHeadersFilter` 自动注入 `sn=device001` / `type=0`

---

## 场景一：客户端首访 / 后台进入客户端管理页 —— 探测绑定状态 + 池状态

### `GET /kpos/api/client/overview`

**用途**
- 客户端首次启动：传 `sn` + `type`，判定本机是否已绑定，命中则刷新 `last_login_*`
- 需要检查同一 SN 已绑定哪些类型时：传 `sn` + `fetchBoundTypes=true`，返回该 SN 下所有已绑定 AppType 序号
- 后台进入客户端管理页：不传任何参数，仅返回池容量 + 区域下拉

**Query 参数**

| 名称 | 类型 | 必填 | 说明 |
|------|------|----|------|
| `sn` | String | 否 | 客户端 SN。默认与 `type` 要么都传要么都不传；当 `fetchBoundTypes=true` 时可只传 `sn` |
| `type` | Integer | 否 | AppType 序号（0=POS, 1=EMENU, 14=KIOSK 等） |
| `fetchBoundsType` | Integer | 否 | AppType 序号；传入合法 AppType 时，在非提前返回路径返回该类型已绑定客户端的 SN/name 列表 |
| `fetchBoundTypes` | Boolean | 否 | 为 `true` 时返回当前 `sn` 下所有未软删绑定的 AppType 序号列表 |

**返回 `data: LicenseClientOverviewDTO`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `bound` | Boolean | 是否已绑定。未传 `sn+type` 时为 `null`；传 `sn+type` 但未命中或已软删时为 `false` |
| `boundTypes` | `List<Integer>` | `fetchBoundTypes=true` 时返回当前 SN 下已绑定的 AppType 序号列表；未请求时为 `null`，没有 active 绑定时为空列表 |
| `client` | `LicenseClientDTO` | 已绑定时返回客户端记录，否则为 `null`（字段见下表） |
| `pools` | `List<LicenseClientPoolStatusDTO>` | 各 AppType 池容量 / 已绑定 / 剩余（仅返回 `totalCap > 0` 的项，最多 15 类） |
| `areas` | `List<AreaOptionDTO>` | 区域下拉项（仅 `id` + `name`） |
| `bounds` | `List<LicenseClientBoundDTO>` | 传 `fetchBoundsType` 时返回的已绑定客户端 SN/name 列表；已绑定命中提前返回时不填充 |

`LicenseClientDTO`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 客户端 ID |
| `sn` | String | 客户端唯一标识，表内唯一 |
| `clientName` | String | 用户输入的客户端名 |
| `type` | Integer | AppType 序号 |
| `typeName` | String | AppType 名（POS / EMENU / KIOSK …） |
| `areaId` | Integer | 关联 `seating_area.id`（可空） |
| `areaName` | String | 区域名称快照（可空） |
| `boundAt` | Date | 当前绑定时间（LIFO 删除排序键） |
| `lastLoginIp` | String | 最近一次 `/kpos/api/client/overview` 客户端 IP（可空） |
| `lastLoginAt` | Date | 最近一次 `/kpos/api/client/overview` 时间（可空） |
| `remark` | String | 备注（可空） |
| `deleted` | Boolean | 软删除标识，`true` 表示已删除 |
| `deleteReason` | String | 删除原因：`ADMIN` / `POOL_SHRINK`（可空） |
| `version` | Integer | 乐观锁版本 |
| `createdOn` | Date | 首次创建时间 |
| `lastUpdated` | Date | 最后更新时间（可空） |

`LicenseClientPoolStatusDTO`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | Integer | AppType 序号 |
| `typeName` | String | AppType 名（POS / EMENU / KIOSK …） |
| `totalCap` | Integer | 池容量（解密 `MAX_*_ALLOWED`） |
| `boundCount` | Integer | 当前已绑定（`license_client.deleted=0`） |
| `remaining` | Integer | 剩余 = `max(0, totalCap - boundCount)` |

`AreaOptionDTO`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 区域 ID（`seating_area.id`） |
| `name` | String | 区域名称 |

`LicenseClientBoundDTO`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `sn` | String | 已绑定客户端 SN |
| `name` | String | 已绑定客户端名称（`license_client.client_name`） |

**请求示例（客户端首访）**

```http
GET /kpos/api/client/overview?sn=SN123456789&type=0
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "bound": true,
    "boundTypes": null,
    "client": {
      "id": 123,
      "sn": "SN123456789",
      "clientName": "前台POS-01",
      "type": 0,
      "typeName": "POS",
      "areaId": 1,
      "areaName": "前厅",
      "boundAt": "2026-05-14T10:00:00.000+00:00",
      "lastLoginIp": "192.168.1.50",
      "lastLoginAt": "2026-05-14T10:30:00.000+00:00",
      "remark": null,
      "deleted": false,
      "deleteReason": null,
      "version": 1,
      "createdOn": "2026-05-10T09:00:00.000+00:00",
      "lastUpdated": "2026-05-14T10:30:00.000+00:00"
    }
  }
}
```

**请求示例（查询 SN 已绑定类型）**

```http
GET /kpos/api/client/overview?sn=SN123456789&fetchBoundTypes=true
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "bound": null,
    "boundTypes": [0, 14],
    "client": null,
    "pools": [
      { "type": 0, "typeName": "POS", "totalCap": 10, "boundCount": 8, "remaining": 2 }
    ],
    "areas": [
      { "id": 1, "name": "前厅" },
      { "id": 2, "name": "后厨" }
    ]
  }
}
```

---

## 场景二：客户端首次绑定 / 重绑

### `POST /kpos/api/client/register`

**用途**
- 客户端拿到 `overview` 返回 `bound=false` 后，用户填写客户端名 + 区域 → 调本接口完成绑定
- 如果前端先用 `fetchBoundTypes=true` 检查同 SN 多类型状态，则可在 `boundTypes` 不包含待注册 `type` 时进入绑定流程
- 同 SN 之前软删过的，会走 **REBIND** 分支（复用记录、释放原席位、池容量校验）

**Body：`LicenseClientRegisterRequest`**（`Content-Type: application/json`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sn` | String | ✅ | 客户端 SN |
| `clientName` | String | ✅ | 用户输入的客户端名（如 "前台 POS-01"） |
| `type` | Integer | ✅ | AppType 序号 |
| `areaId` | Integer | 否 | 关联 `seating_area.id`，可空 |

**返回 `data: LicenseClientDTO`**（字段同 overview.client）

**请求示例**

```http
POST /kpos/api/client/register
Content-Type: application/json

{
  "sn": "SN123456789",
  "clientName": "前台POS-01",
  "type": 0,
  "areaId": 1
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "id": 123,
    "sn": "SN123456789",
    "clientName": "前台POS-01",
    "type": 0,
    "typeName": "POS",
    "areaId": 1,
    "areaName": "前厅",
    "boundAt": "2026-05-14T10:00:00.000+00:00",
    "deleted": false,
    "version": 0
  }
}
```

---

## 场景三：客户端 session 登录

### `POST /kpos/api/client/session/login`

**用途**
- shell / 客户端按 `sn` + AppType 名称换取当前兼容会话信息
- 仅查询已绑定且未软删的 `license_client` 行；`sessionKey` 直接等于入参 `sn`

**Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sn` | String | ✅ | 客户端 SN |
| `type` | String | ✅ | AppType 名称，如 `POS_IOS`；service 兼容纯数字字符串 |

**返回 `data: LicenseClientSessionLoginDTO`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `successful` | boolean | 查询到有效绑定时为 `true` |
| `sessionKey` | String | 等于入参 `sn` |
| `sessionKeyRemainingActiveTime` | long | 固定 1 day，即 `86400000` ms |
| `appInstanceId` | Integer | `license_client.id` |
| `appInstanceName` | String | `license_client.client_name` |
| `appInstanceType` | String | AppType 名称，如 `POS_IOS` |

**请求示例**

```http
POST /kpos/api/client/session/login
Content-Type: application/json

{
  "sn": "device-sn-from-shell",
  "type": "POS_IOS"
}
```

**响应示例**

```json
{
  "code": 0,
  "data": {
    "successful": true,
    "sessionKey": "device-sn-from-shell",
    "sessionKeyRemainingActiveTime": 86400000,
    "appInstanceId": 123,
    "appInstanceName": "POS-xxx",
    "appInstanceType": "POS_IOS"
  }
}
```

---

## 场景四：客户端轻量列表

### `GET /kpos/api/client/list`

**用途**
- 无查询参数时返回所有未软删客户端的轻量列表，供客户端发现/选择
- 该入口在 `SnAuthFilter` 中白名单放行；带查询参数的旧分页兼容入口仍需 header

**返回 `data: List<LicenseClientListItemDTO>`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | `license_client.id` |
| `displayName` | String | `license_client.client_name` |
| `type` | String | AppType 名称，如 `POS_IOS` |
| `printerId` | Integer | `license_client_config.receipt_printer_id` |
| `displayNameForKitchen` | String | `license_client_config.displays_name` |

**响应示例**

```json
{
  "code": 0,
  "data": [
    {
      "id": 123,
      "displayName": "POS-xxx",
      "type": "POS_IOS",
      "printerId": 1,
      "displayNameForKitchen": "KD-1"
    }
  ]
}
```

---

## 场景五：获取当前客户端完整信息

### `GET /kpos/api/client/current`

**用途**
- 按 `SnAuthFilter` 已校验通过的 `X-Client-Sn` + `X-Client-Type` 获取当前客户端完整 `LicenseClientCurrentDTO`
- 读取路径复用 `ILicenseReader.getCurrentLicenseClient()` + `ILicenseClientConfigService.getByClientId()`，返回当前客户端、兼容 session 与配置富化字段

**Header**：必填 `X-Client-Sn` + `X-Client-Type`

**返回 `data: LicenseClientCurrentDTO`**

- 继承 `LicenseClientDTO` 全部字段：`id/sn/clientName/type/typeName/areaId/areaName/boundAt/lastLoginIp/lastLoginAt/remark/deleted/deleteReason/version/createdOn/lastUpdated`
- 包含 `LicenseClientSessionLoginDTO` 全部字段：`successful/sessionKey/sessionKeyRemainingActiveTime/appInstanceId/appInstanceName/appInstanceType`
- 包含 `LicenseClientConfigResponseDTO` 配置富化字段：打印机、外设绑定、KDS、`appVersion`、`devices`、`settings` 等
- 同名不同类型冲突处理：`type` 保留 `LicenseClientDTO.type` 数字值；`LicenseClientConfigResponseDTO.type` 通过 `configType` 返回；配置行的 `id/version/createdOn/lastUpdated` 通过 `configId/configVersion/configCreatedOn/configLastUpdated` 返回

**请求示例**

```http
GET /kpos/api/client/current
X-Client-Sn: device001
X-Client-Type: 0
```

---

## 场景六：后台客户端全量列表（不分页）

### `GET /kpos/api/client/all`

**用途**
- 返回所有 `license_client` 行的 `LicenseClientDTO` 列表，不分页、不筛选
- 包含软删行；前端可通过 `deleted` / `deleteReason` 判断当前状态

**Header**：必填 `X-Client-Sn` + `X-Client-Type`

**返回 `data: List<LicenseClientDTO>`**（字段同 `overview.client`）

**请求示例**

```http
GET /kpos/api/client/all
X-Client-Sn: device001
X-Client-Type: 0
```

---

## 场景七：后台客户端列表分页查询

### `POST /kpos/api/client/page`

**用途**
- 后台客户端管理页表格数据源；支持按 `clientName` / `sn` / `type` / `areaId` / `status` 组合筛选

**Header**：必填 `X-Client-Sn` + `X-Client-Type`

**Body：`LicenseClientQueryParam`**（`Content-Type: application/json`，可为空）

| 名称 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `clientName` | String | 否 | - | 客户端名模糊匹配 |
| `sn` | String | 否 | - | SN 模糊匹配 |
| `type` | Integer | 否 | - | AppType 序号精确 |
| `areaId` | Integer | 否 | - | 区域 ID 精确 |
| `status` | String | 否 | `ALL` | `ALL` / `BOUND` / `DELETED` |
| `pageNum` | Integer | 否 | `1` | 1-based 页码 |
| `pageSize` | Integer | 否 | `20` | 每页大小 |

**返回 `data: LicenseClientPageResultDTO`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | long | 总条数 |
| `pageNum` | int | 当前页码（1-based） |
| `pageSize` | int | 每页大小 |
| `items` | `List<LicenseClientDTO>` | 当前页客户端列表 |

**请求示例**

```http
POST /kpos/api/client/page
Content-Type: application/json
X-Client-Sn: device001
X-Client-Type: 0

{
  "type": 0,
  "status": "BOUND",
  "pageNum": 1,
  "pageSize": 10
}
```

**响应示例**

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "total": 27,
    "pageNum": 1,
    "pageSize": 10,
    "items": [
      { "id": 123, "sn": "SN123456789", "clientName": "前台POS-01", "type": 0, "typeName": "POS", "areaId": 1, "areaName": "前厅", "deleted": false, "version": 1 }
    ]
  }
}
```

---

## 场景八：后台编辑客户端

### `POST /kpos/api/client/update`

**用途**
- 修改客户端名 / 区域 / 备注；`type` 与 `sn` 不允许改
- 使用乐观锁，前端必须回传上一次拿到的 `version`

**Header**：必填 `X-Client-Sn` + `X-Client-Type`

**Body：`LicenseClientUpdateRequest`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | Integer | ✅ | 客户端 ID |
| `version` | Integer | ✅ | 乐观锁版本（与 DB 当前 `version` 必须一致） |
| `clientName` | String | 否 | 不传则保持原值 |
| `areaId` | Integer | 否 | 指向无效区域时 service 层会清空 `areaId` + `areaName` 快照 |
| `remark` | String | 否 | 备注；不传则保持原值 |

**返回 `data: LicenseClientDTO`**（更新后的最新记录）

**请求示例**

```http
POST /kpos/api/client/update
Content-Type: application/json
X-Client-Sn: device001
X-Client-Type: 0

{
  "id": 123,
  "version": 1,
  "clientName": "前台POS-01-改名",
  "areaId": 2,
  "remark": "调整到后厨"
}
```

---

## 场景九：后台软删除客户端

### `POST /kpos/api/client/delete`

**用途**
- 软删除：`deleted=1` + `delete_reason=ADMIN`；释放该 AppType 一个池席位
- 同 SN 之后可再次走 `register` 走 REBIND 分支

**Header**：必填 `X-Client-Sn` + `X-Client-Type`

**Body：`LicenseClientDeleteRequest`**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | Integer | ✅ | 客户端 ID |
| `remark` | String | 否 | 删除备注（写入 `binding_log.remark`） |

**返回**：`data` 为 `null`

**请求示例**

```http
POST /kpos/api/client/delete
Content-Type: application/json
X-Client-Sn: device001
X-Client-Type: 0

{
  "id": 123,
  "remark": "设备报废"
}
```

**响应示例**

```json
{ "code": 0, "msg": "success" }
```

---

## 场景十：客户端自解绑

### `POST /kpos/api/client/unbind`

**用途**
- 客户端主动调用本接口解绑自身（如设备退役 / 切换门店 / 重装），释放该 AppType 一个池席位
- 与 `/kpos/api/client/delete`（admin 后台软删）区分：身份由 SnAuthFilter 已验过的 `X-Client-Sn` / `X-Client-Type` 推导，**不接受** body 中传 `id` / `sn` / `type`
- 写入 `deleted=1` + `delete_reason=CLIENT_SELF`；binding_log `action=DELETE_CLIENT_SELF` / `actor_source=CLIENT` / `actor_user_id=null`
- 解绑后该 SN 想再用须重走 `/kpos/api/client/register`（走 REBIND 分支复用同一行）

**Header**：必填 `X-Client-Sn` + `X-Client-Type`

**Body：`LicenseClientUnbindRequest`**（可选；不传也合法）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `remark` | String | 否 | 解绑备注（写入 `binding_log.remark`） |

**返回**：`data` 为 `null`

**请求示例**

```http
POST /kpos/api/client/unbind
Content-Type: application/json
X-Client-Sn: device001
X-Client-Type: 0

{
  "remark": "设备报废"
}
```

**响应示例**

```json
{ "code": 0, "msg": "success" }
```

**异常**：当前 (sn, type) 未绑定或已软删 → `BusinessException("LicenseClient not bound: sn=... type=...")`（缓存只保活跃行，cache miss 即等价于未绑）

---

## 错误码速查（业务约定）

| code | 含义 |
|------|------|
| `0` | 成功 |
| `400` | 入参校验失败（如缺少必填字段、`sn`/`type` 半给） |
| `401` | 客户端身份头部未命中 `ILicenseClientCache`（SnAuthFilter 拦截） |
| `500` | 服务端异常 |

> 具体业务错误（池容量超限、版本号冲突、SN 已绑定等）由 `BusinessException` 抛出，`code` / `msg` 见 service 层定义。
