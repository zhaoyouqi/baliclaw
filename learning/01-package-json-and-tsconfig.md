# 学习笔记 01：从 `package.json` 和 `tsconfig.json` 理解 Node/TypeScript 工程

这篇笔记基于当前仓库的这几个文件：

- [`package.json`](../package.json)
- [`tsconfig.json`](../tsconfig.json)
- [`tech-spec.md`](../tech-spec.md)
- [`task-list.md`](../task-list.md)

目标不是系统学习 Node，而是先搞清楚这个项目为什么这样配置。

## 1. `package.json` 是什么

可以先把 `package.json` 理解成 Node 项目的中心配置文件，作用接近于：

- Python 里的 `pyproject.toml` + 一部分依赖声明
- Java 里的 `pom.xml` / `build.gradle`

它通常负责这些事情：

- 项目名称和版本
- 依赖管理
- 构建/测试脚本
- 命令行入口
- 模块类型
- 运行环境要求

这个仓库里的 `package.json` 已经不是初始化后的最小版本，而是工程化配置。

## 2. `package.json` 通常怎么创建

常见方式有两种：

1. 用 `pnpm init` 先生成一个最小文件
2. 手工新建 `package.json`

实际开发里，很多项目即使先执行了 `pnpm init`，后面也会立刻手工修改，补充：

- `scripts`
- `dependencies`
- `devDependencies`
- `type`
- `engines`
- `bin`

所以重点不是“最开始怎么生成”，而是“最终它被整理成什么样”。

## 3. 当前项目里的 `package.json` 重点字段

### `name`

项目名。发布到 npm 时会作为包名；不发布时也作为项目标识。

### `version`

项目版本号，通常遵循语义化版本。

### `private: true`

表示这是私有项目，不准备直接发布到 npm，也能防止误发布。

### `description`

项目描述信息。

### `type: "module"`

这是一个关键配置，表示当前项目按 ESM 模块规则运行。

它直接影响代码里使用：

- `import`
- `export`

而不是旧的：

- `require`
- `module.exports`

### `engines`

限制运行环境版本。

当前项目要求：

- Node `>=22`
- pnpm `>=10`

这表示项目默认不考虑旧版本兼容。

### `packageManager`

声明项目使用的包管理器和版本：

- `pnpm@10.6.3`

作用是统一团队环境，避免有人用 npm、有人用 yarn。

### `bin`

定义安装后暴露出的命令行命令：

- `baliclaw`
- `baliclawd`

它们指向编译后的产物：

- `./dist/cli/index.js`
- `./dist/daemon/index.js`

### `scripts`

定义项目内建命令，也就是平时运行的：

- `pnpm build`
- `pnpm dev`
- `pnpm test`

可以把它理解成项目级命令别名。

### `dependencies`

运行时依赖。程序真正运行需要它们。

### `devDependencies`

开发时依赖。编译、测试、类型支持需要，但最终运行时不一定需要。

## 4. 当前项目依赖的作用

### `dependencies`

- `@anthropic-ai/claude-agent-sdk`
  - Claude Agent SDK，是这个项目的核心 AI 接入层。
  - 用来发起 agent 查询、绑定会话、控制工具使用等。

- `chokidar`
  - 文件监听库。
  - 常用于监听配置文件变化并自动重载。

- `commander`
  - 命令行参数解析库。
  - 用来实现 CLI 命令和子命令。

- `grammy`
  - Telegram Bot API 客户端。
  - 用于接入 Telegram。

- `json5`
  - JSON5 解析库。
  - 适合人手写配置文件，因为比标准 JSON 更宽松。

- `pino`
  - 结构化日志库。
  - 比 `console.log` 更适合服务端和 daemon 程序。

- `zod`
  - 运行时校验库。
  - TypeScript 类型只在编译期有效，运行时读到外部输入仍然需要校验。

### `devDependencies`

- `@types/node`
  - Node.js 类型定义。

- `tsx`
  - 开发时直接运行 TypeScript 源码。

- `typescript`
  - TypeScript 编译器。

- `vitest`
  - 测试框架。

## 5. 为什么不应该长期使用 `"latest"`

之前项目里有一项依赖写成：

```json
"@anthropic-ai/claude-agent-sdk": "latest"
```

现在已经固定为：

```json
"@anthropic-ai/claude-agent-sdk": "0.2.72"
```

原因是：

- `latest` 会漂移
- 新机器安装时可能拿到不同版本
- 上游 breaking change 可能导致项目突然出问题
- 不利于团队协作和 CI 稳定性

虽然 `pnpm-lock.yaml` 能锁住“当前安装结果”，但在 `package.json` 里写明确版本更稳妥。

## 6. 什么是 ESM

`ESM` 是 `ECMAScript Modules`，也就是 JavaScript 官方标准模块系统。

现代写法是：

```ts
import { readFile } from 'node:fs/promises';

export function foo() {}
```

旧的 CommonJS 写法是：

```js
const fs = require('fs');

module.exports = { foo };
```

在这个项目里，`"type": "module"` 表示整个项目走 ESM 方向。

先记住一点就够了：

- ESM 主要看 `import/export`
- CommonJS 主要看 `require/module.exports`

## 7. Node 是什么

Node.js 建立在 V8 引擎之上。

可以这样理解：

- `V8` 是 JavaScript 引擎
- `Node.js` 是 JavaScript 运行时（runtime）

Node 和浏览器都能执行 JavaScript，但提供的宿主环境能力不同。

浏览器更偏前端页面环境：

- `window`
- `document`
- DOM
- 页面渲染

Node 更偏服务端/命令行环境：

- `fs`
- `path`
- `process`
- 网络
- 子进程

所以两者都能跑 JS，但不是同一个运行环境。

## 8. `scripts` 是什么

`scripts` 可以理解成项目内置命令。

当前项目中有：

- `build`: `tsc -p tsconfig.json`
- `clean`: `rm -rf dist coverage`
- `dev`: `tsx src/cli/index.ts status`
- `test`: `vitest run`
- `test:watch`: `vitest`

它们分别表示：

### `build`

用 TypeScript 编译器按 `tsconfig.json` 把 `src/` 编译到 `dist/`。

### `clean`

清理构建产物和覆盖率目录。

### `dev`

用 `tsx` 直接运行 TypeScript 源码。

这里运行的是：

- `src/cli/index.ts`

并传入命令参数：

- `status`

### `test`

运行一次测试并退出。

### `test:watch`

进入监听模式，文件变动后自动重跑测试。

## 9. 为什么 `dev` 用 `tsx`，`build` 用 `tsc`

### `tsx`

目标是开发时方便。

它可以直接执行 TypeScript 文件，不需要先手动编译。

适合：

- 快速试运行
- 本地开发
- 改完代码立即验证

### `tsc`

目标是正式编译。

它会把：

- `src/**/*.ts`

编译成：

- `dist/**/*.js`

还会生成：

- `.d.ts`
- source map

可以这样记：

- `tsx` 偏“开发时直接跑源码”
- `tsc` 偏“正式构建产物”

## 10. `bin` 和 `scripts` 的区别

### `scripts`

面向项目开发者，用法是：

```bash
pnpm build
pnpm dev
pnpm test
```

### `bin`

面向命令行用户，表示这个项目安装后能提供哪些外部命令。

当前项目里：

- `baliclaw` -> `./dist/cli/index.js`
- `baliclawd` -> `./dist/daemon/index.js`

所以可以这样理解：

- `scripts` 是项目内部任务入口
- `bin` 是项目对外暴露的可执行命令

## 11. `tsconfig.json` 是什么

`tsconfig.json` 是 TypeScript 编译器配置文件。

它主要决定：

- 哪些文件参与编译
- 按什么模块规则处理
- 产物输出到哪里
- 类型检查严格到什么程度

## 12. 当前项目里的 `tsconfig.json` 重点字段

### `target: "ES2023"`

表示编译输出面向较新的 JavaScript 版本。因为项目要求 Node 22+，所以可以使用较新的目标版本。

### `module: "NodeNext"`

表示按 Node 的现代模块规则处理模块。

### `moduleResolution: "NodeNext"`

表示按 Node 的现代规则解析导入路径。

这两个配置和 `package.json` 里的 `"type": "module"` 是配套的。

### `rootDir: "src"`

源码根目录是 `src`。

### `outDir: "dist"`

编译产物输出到 `dist`。

所以：

- `src/cli/index.ts`

会对应到：

- `dist/cli/index.js`

### `strict: true`

开启 TypeScript 严格模式，是最重要的类型安全开关。

### `noUncheckedIndexedAccess: true`

访问数组下标或字典时，更保守地认为结果可能是 `undefined`。

### `exactOptionalPropertyTypes: true`

让可选属性的类型语义更精确。

### `forceConsistentCasingInFileNames: true`

避免文件名大小写不一致导致跨平台问题。

### `skipLibCheck: true`

跳过第三方依赖的类型声明检查，加快编译。

### `esModuleInterop: true`

改善 ESM 和部分 CommonJS 包的互操作体验。

### `resolveJsonModule: true`

允许导入 JSON 文件。

### `declaration: true`

生成 `.d.ts` 类型声明文件。

### `sourceMap: true`

生成 source map，便于调试。

### `types: ["node"]`

启用 Node.js 类型定义。

### `include`

当前主构建只包含：

```json
["src/**/*.ts"]
```

### `exclude`

排除：

```json
["dist", "node_modules"]
```

## 13. `ESNext` 和 `NodeNext` 的区别

可以先简单记成：

- `ESNext` 更偏 JavaScript 语言标准视角
- `NodeNext` 更偏 Node 运行时真实行为视角

两者都可能支持现代 `import/export`，但 `NodeNext` 更关心：

- `package.json` 里的 `"type"`
- Node 实际如何解析模块
- 最终运行时能不能真的找到对应文件

所以对于“最终由 Node 直接执行”的项目，`NodeNext` 往往更合适。

## 14. 目前最重要的理解

到这里先记住这几件事：

1. `package.json` 管项目身份、依赖、脚本和命令入口。
2. `tsconfig.json` 管 TypeScript 的编译和类型检查规则。
3. 这个项目是 Node 22+、TypeScript、ESM、pnpm 的组合。
4. `tsx` 用于开发时直接运行源码，`tsc` 用于正式编译。
5. `scripts` 是项目内部命令，`bin` 是项目对外暴露的 CLI 命令。
6. `NodeNext` 说明这是一个按 Node 真实模块规则组织的 TypeScript 项目。

## 15. 下一步建议

下一步最适合继续看的文件是：

- [`src/cli/index.ts`](../src/cli/index.ts)

因为它能把这些配置串起来：

- `bin` 最终指向什么
- `dev` 实际在运行什么
- CLI 是怎么启动的
