---
alwaysApply: true
scene: git_message
---

# Git Commit Message 规范

本项目采用 **Conventional Commits** 规范，确保提交历史清晰、可自动化生成 Changelog。

## 格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

- **type**：必填，表示提交类型。
- **scope**：可选，表示影响范围，用英文括号包裹。
- **description**：必填，简短描述变更内容，使用英文或中文均可，建议首字母小写，结尾不加句号。
- **body**：可选，详细描述变更原因、上下文等。
- **footer**：可选，关联 Issue（如 `Closes #123`）或标注破坏性变更（`BREAKING CHANGE:`）。

## 允许的 type

| type     | 说明                                 |
|----------|--------------------------------------|
| feat     | 新功能                               |
| fix      | 修复 bug                             |
| docs     | 文档更新                             |
| style    | 代码格式、样式调整（不影响逻辑）     |
| refactor | 重构（既非新功能也不是修 bug）       |
| perf     | 性能优化                             |
| test     | 增加或修改测试                       |
| chore    | 构建过程或辅助工具的变动             |
| config   | 配置文件调整（如环境变量、构建配置） |
| plan     | 项目计划、待办事项更新               |

> 注意：请勿使用拼写错误的类型（如 `updata`），统一使用英文单词。

## 示例

### 简单 feat
```
feat: 自动加载上级目录 .env，支持 NO_LOAD_PARENT_ENV 关闭
```

### 带 scope 的 fix
```
fix(parser): disable yaml line width wrapping
```

### 关联 Issue
```
feat: 增量翻译支持按字段/Body 粒度哈希
- 仅翻译变更部分
Closes #19, #20
```

### 多行 body
```
refactor: 修改文件路径处理方式

将相对路径转换为绝对路径，避免因工作目录不同导致的文件找不到问题。
```

## 注意事项

1. **语言**：description 中英文皆可，但同一项目请保持风格一致。当前仓库中英文混合，推荐描述使用中文，技术细节可夹杂英文名词。
2. **粒度**：一次提交只做一件事，避免一个提交混合 feat 和 fix。
3. **避免不规范提交**：禁止使用无前缀的纯中文提交（如“更新配置”），必须标注类型。
4. **Merge 提交**：保留 GitHub 默认的合并信息，无需修改。
5. **破坏性变更**：在 footer 注明 `BREAKING CHANGE:`，并说明迁移方法。