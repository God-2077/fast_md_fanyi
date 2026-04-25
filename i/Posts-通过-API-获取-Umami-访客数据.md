---
title: 'Posts: 通过 Umami API 获取访客数据'
link: bian-jian-tong-guo-api-huo-qu-umami-fang-ke-shu-ju
date: 2026-04-06 08:36:54
update: 2026-04-06 09:04:10
description: 详细讲解如何通过 Umami API 获取网站访客数据，包括 Umami Cloud 与自托管版本的 API 密钥获取、分享链接 Token 认证方式，以及 /api/websites/:websiteId/stats 接口的调用、参数过滤与新旧版本数据结构差异，完整实现页面访问量、独立访客等数据的程序化获取。
categories:
  - 文章
draft: false
---

## 认证

Umami API 需要认证，可以是使用 用户的 API 密钥 或是 使用网站分享中的 API 密钥 `x-umami-share-token`。



```json
{
  "username": "your-username",
  "password": "your-password"
}
```
