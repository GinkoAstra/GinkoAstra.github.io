## 为什么需要插件系统

logkit 的 sink（输出端）从最初的 3 个增长到 11 个之后，`Cargo.toml` 里的可选依赖已经超过了 40 个。每加一个 sink，核心包就要多背一份传递依赖。插件系统的目标很朴素：

> 核心只管记录日志这件事本身；输出到哪、怎么编码，全部是可以按需装配的模块。

## 三个候选方案

| 方案 | 隔离性 | 开销 | 心智负担 |
|------|--------|------|----------|
| `dlopen` 动态库 | 中（同进程） | 极低 | 高（ABI 稳定性） |
| IPC 子进程 | 高 | 高（序列化 + 拷贝） | 中 |
| Wasm（wasmtime） | 高 | 低（~5% 以内） | 中 |

社区讨论后排除动态库方案的直接原因：Rust 没有稳定 ABI，`abi_stable` crate 能解决但把 API 复杂度转嫁给了插件作者。IPC 方案对结构化日志这种高频小消息场景，ping-pong 延迟在 p99 上达到了 1.2ms，不可接受。

最终选择 **Wasm 沙箱 + 宿主侧 capability 白名单**：

```rust
pub trait LogSink: Send + Sync {
    fn name(&self) -> &'static str;
    fn write(&self, batch: &[Record]) -> Result<(), SinkError>;
    fn flush(&self) -> Result<(), SinkError> { Ok(()) }
}

pub fn load_wasm_sink(path: &Path, caps: Capabilities) -> Result<Box<dyn LogSink>, LoadError> {
    let module = Module::from_file(&ENGINE, path)?;
    WasmSink::instantiate(module, caps).map(|s| Box::new(s) as _)
}
```

## RFC 中最有价值的四条反对意见

1. **"Wasm 冷启动会让首次写日志卡顿"** —— 属实。缓解措施：启动期预实例化 + 模块缓存目录，实测冷启动从 38ms 降到 1.9ms。
2. **"capability 白名单会演变成权限地狱"** —— 有道理。所以 capability 只有 4 种：`net`、`fs`、`env`、`clock`，不支持组合细化，宁可粗粒度。
3. **"为什么不用 tracing 生态？"** —— logkit 的定位是嵌入式场景的二进制体积敏感用户，tracing 宏展开后的体积我们承担不起。
4. **"插件崩溃会不会带走主进程？"** —— Wasm 沙箱内 trap 只会返回错误，已加入混沌测试验证。

## 下一步

- v0.4.0 正式版：等插件 API 在 3 个社区插件上验证两周
- v0.5.0：opentelemetry 协议插件（由社区同学认领）

欢迎在仓库 Discussion 区拍砖。
