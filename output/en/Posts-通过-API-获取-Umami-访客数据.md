---
title: "Posts: Get visitor data via Umami API"
link: "bian-jian-tong-guo-api-huo-qu-umami-fang-ke-shu-ju"
date: "2026-04-06T08:36:54.000Z"
update: "2026-04-06T09:04:10.000Z"
description: "A detailed explanation on how to obtain website visitor data through Umami API, including the key acquisition and sharing link Token authentication methods for both Umami Cloud and self-hosted versions of API. This will cover the invocation of the /api/websites/:websiteId/stats API, parameter filtering, and differences in data structures between old and new versions, to enable the programmatic retrieval of metrics such as pageviews and unique visitors."
categories: ["文章"]
draft: false
---

## Authentication

Umami API requires authentication, which can be done using the user's API key or by using the API key from the website share `x-umami-share-token`oegz5wm_i3il3gah_7`.

```json
{
  "username": "your-username",
  "password": "your-password"
}
````