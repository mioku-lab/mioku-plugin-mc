---
title: Minecraft 插件配置
description: 配置 Minecraft 服务器连接、消息同步与 RCON 命令白名单
fields:
  - key: base.say_way
    label: 聊天前缀
    type: text
    description: QQ 消息转发到 MC 时显示的前缀，默认 "说："
    placeholder: 说：

  - key: base.display_server_name
    label: 显示服务器名称
    type: switch
    description: 消息中是否显示服务器名称

  - key: base.reverse_ws_enabled
    label: 启用反向 WebSocket
    type: switch
    description: 启用反向连接（MC 服务器连接到此机器人）

  - key: base.reverse_ws_port
    label: 反向连接端口
    type: number
    description: 反向 WebSocket 监听端口
    placeholder: 8080

  - key: base.reverse_ws_path
    label: 反向连接路径
    type: text
    description: 反向 WebSocket 路径
    placeholder: /minecraft/ws

  - key: base.reverse_ws_password
    label: 反向连接密码
    type: secret
    description: 反向 WebSocket 连接密码

  - key: base.servers
    label: 服务器列表
    type: array
    description: 配置多个 Minecraft 服务器连接
    itemFields:
      - key: server_name
        label: 服务器名称
        type: text
        description: 服务器唯一标识，不能与其他服务器重复
        placeholder: main

      - key: ws_url
        label: WebSocket 地址
        type: text
        description: 服务器 WebSocket 连接地址（正向连接时使用）
        placeholder: ws://127.0.0.1:8081

      - key: ws_password
        label: 连接密码
        type: text
        description: WebSocket 连接密码（可选）

      - key: group_list
        label: 关联群聊
        type: text
        description: 关联的 QQ 群号

      - key: bot_self_id
        label: 机器人账号
        type: text
        description: 机器人 QQ 号

      - key: command_header
        label: 命令前缀
        type: text
        description: RCON 命令前缀，默认 "$"
        placeholder: $

      - key: command_user
        label: 命令白名单
        type: text
        description: 允许执行 RCON 命令的 QQ 号列表，每行一个

      - key: rcon_command_whitelist
        label: RCON 命令白名单
        type: text
        description: 允许执行的 RCON 命令列表，每行一个

      - key: sync_enabled
        label: 启用同步
        type: switch
        description: 是否启用消息同步

      - key: ws_max_attempts
        label: 最大重连次数
        type: number
        description: WebSocket 最大重连次数
        placeholder: 10

      - key: forward_ws_enabled
        label: 启用正向 WebSocket
        type: switch
        description: 启用正向连接（连接到 MC 服务器）

      - key: reverse_ws_enabled
        label: 启用反向连接
        type: switch
        description: 该服务器是否启用反向连接

      - key: rcon_enabled
        label: 启用 RCON
        type: switch
        description: 启用 RCON 命令执行

      - key: rcon_host
        label: RCON 地址
        type: text
        description: RCON 服务器地址
        placeholder: 127.0.0.1

      - key: rcon_port
        label: RCON 端口
        type: number
        description: RCON 端口
        placeholder: 25575

      - key: rcon_password
        label: RCON 密码
        type: secret
        description: RCON 密码
---

```mioku-fields
keys:
  - base.say_way
  - base.display_server_name
  - base.reverse_ws_enabled
  - base.reverse_ws_port
  - base.reverse_ws_path
  - base.reverse_ws_password
  - base.servers
```