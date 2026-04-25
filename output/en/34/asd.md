---
title: "targetShortNamePosts: 通过 Umami API 获取访客数据"
link: "bian-jian-tong-guo-api-huo-qu-umami-fang-ke-shu-ju"
date: "2026-04-06T08:36:54.000Z"
update: "2026-04-06T09:04:10.000Z"
description: "targetShortName详细讲解如何通过 Umami API 获取网站访客数据，包括 Umami Cloud 与自托管版本的 API 密钥获取、分享链接 Token 认证方式，以及 /api/websites/:websiteId/stats 接口的调用、参数过滤与新旧版本数据结构差异，完整实现页面访问量、独立访客等数据的程序化获取。"
categories: ["文章"]
draft: false
---

translateMarkdown ## 认证

Umami API 需要认证，可以是使用 用户的 API 密钥 或是 使用网站分享中的 API 密钥 `x-umami-share-token`。

### 获取用户的 API 密钥

#### Umami Cloud 用户获取 API 密钥

如果你的是 Umami Cloud 用户，你需要在 Umami Cloud 控制台中生成 API 密钥。

[Umami Cloud API 密钥文档](https://docs.umami.is/docs/cloud/api-key)

#### Umami Self-Hosted 用户获取 API 密钥

:::info
如果你的 Token 会对外公开，建议转移网站到一个团队，然后添加一个仅有访问权限的用户，使用该用户的 Token 进行认证。
:::


如果你的是 Umami Self-Hosted 用户，需要在 `POST /api/auth/login` 发送以下请求体，

```json
{
  "username": "your-username",
  "password": "your-password"
}
```

如果登录成功，你应该会收到如下回复，记下 `token`。

```json
{
  "token": "eyTMjU2IiwiY...4Q0JDLUhWxnIjoiUE_A",
  "user": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "username": "admin",
    "role": "admin",
    "createdAt": "2000-00-00T00:00:00.000Z",
    "isAdmin": true
  }
}
```

### 获取分享链接的 API 密钥

给网站开启分享链接后，你将会收到一个分享链接，如下：

`https://u.ksable.top/share/gR1PdRDiutFusWn6`

给链接的 `pathname` 前添加 `api`，如下：

`https://u.ksable.top/api/share/gR1PdRDiutFusWn6`

然后打开它，你将会收到如下回复，记下 `token`。

```json
{
  "websiteId": "a-b-c-d",
  "token": "a.b.c"
}
```

### 给接口添加认证

给接口添加认证，你需要在请求头中添加 `authorization` 字段，值为 `Bearer {token}`。

```http
GET /api/*
Authorization: Bearer a.b.c
```

如果你是从分享链接获取的 `token`，你需要在请求头中添加 `x-umami-share-token` 字段，值为 `token`。

```http
GET /api/*
x-umami-share-token: a.b.c
```

## 获取访客数据

### 接口地址

`GET /api/websites/:websiteId/stats`

### 参数

| 参数      | 参数类型   | 描述        |
| ------- | ------ | --------- |
| startAt | number | 开始时间，单位毫秒 |
| endAt   | number | 结束时间，单位毫秒 |
| filters | object | 过滤参数      |

例如：

```http
GET /api/websites/:websiteId/stats
Authorization: Bearer a.b.c
```

将会收到如下回复，

```json
{
  "pageviews": 15171,
  "visitors": 4415,
  "visits": 5680,
  "bounces": 3567,
  "totaltime": 809968,
  "comparison": {
    "pageviews": 38675,
    "visitors": 10568,
    "visits": 14595,
    "bounces": 9364,
    "totaltime": 2182387
  }
}
```

其中 `pageviews` 是页面访问量，`visitors` 是独立访客数量，通常只会用到这两个指标。

一些字段的描述如下：

| **字段** | **描述** |
| ------- | ------ |
| `pageviews` | 页面点击 |
| `visitors` | 独立访客数量 |
| `visits` | 独立访问次数 |
| `bounces` | 访问单一页面的访客数量 |
| `totaltime` | 在网站上花的时间 |

+++warning 注意 如果你使用的是旧版的 Umami，返回的数据结构可能与新版不同

旧版 Umami 返回的数据结构如下：

```json
{
  "pageviews": {
    "value": 15171
  },
  "visitors": {
    "value": 4415
  },
  "visits": {
    "value": 5680
  },
  "bounces": {
    "value": 3567
  },
  "totaltime": {
    "value": 809968
  }
}
```

+++

可以根据需要，添加 `filters` 参数来过滤数据。如 `path=/post/bian-jian-tong-guo-api-huo-qu-umami-fang-ke-shu-ju`

`GET /api/websites/:websiteId/stats?path=/post/bian-jian-tong-guo-api-huo-qu-umami-fang-ke-shu-ju`

将会返回在 path 为 `/post/bian-jian-tong-guo-api-huo-qu-umami-fang-ke-shu-ju` 的访客数据。

+++primary 一些过滤参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `path` | string | URL 路径 |
| `referrer` | string | 引荐来源 |
| `title` | string | 页面标题 |
| `query` | string | 查询参数 |
| `browser` | string | 浏览器 |
| `os` | string | 操作系统 |
| `device` | string | 设备名称（例如：Mobile） |
| `country` | string | 国家 |
| `region` | string | 地区/州/省份 |
| `city` | string | 城市 |
| `language` | string | 浏览器语言 |
| `hostname` | string | 主机名 |
| `tag` | string | 标签 |
| `event` | string | 事件 |
| `distinctId` | string | 唯一标识 ID |
| `utmSource` | string | UTM 来源 |
| `utmMedium` | string | UTM 媒介 |
| `utmCampaign` | string | UTM 活动名称 |
| `utmContent` | string | UTM 内容 |
| `utmTerm` | string | UTM 关键词 |
| `segment` | uuid | 用户分群 UUID |
| `cohort` | uuid | 用户群组 UUID |

+++

:::info
其它的一些 API 参见 [Umami API 文档](https://docs.umami.is/docs/api)
:::

## 参考

- [Umami API 文档](https://docs.umami.is/docs/api)