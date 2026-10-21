## 先说结论

v0.3.0 相比 v0.2.x，在 16 线程并发写日志的 benchmark 下：

- 吞吐量：**42 万条/s → 340 万条/s（8.1x）**
- p99 延迟：840µs → 96µs
- 内存峰值：下降 43%

提升来自三次推翻重来的重构，没有一次是"优化"，全都是"重写"。

## 第一次：干掉共享队列上的 mutex

v0.2 的架构是所有线程往一个 `Mutex<VecDeque<Record>>` 里推。火焰图里 61% 的时间在等锁。

改成每个线程一个无界 MPSC channel，后台 aggregator 轮询收：

```rust
// 每个 writer 线程持有一个 producer
let (tx, rx) = mpsc::unbounded::<Record>();
registry.register(rx);

// 写入路径零锁
tx.send(record)?; // 仅一次原子操作 + 可能的唤醒
```

吞吐直接到 150 万条/s。但新问题：**无界队列在突发流量下内存爆炸**，压测时 RSS 冲到 1.7GB。

## 第二次：无界改有界，背压怎么传

加容量上限简单，难的是满了怎么办。三个选择：

1. 丢弃 + 计数（metrics 场景可接受，审计场景不可接受）
2. 阻塞写入方（会传染到业务线程）
3. 溢出落盘（复杂度最高）

最终做成可配置策略，默认"丢弃最旧 + 计数器导出"。关键洞察是：**背压策略没有银弹，必须让使用者按业务语义选择**。

## 第三次：aggregator 的批处理节奏

v0.3 的最后一块拼图：aggregator 不再逐条处理，而是按"时间片或批量阈值，先到为准"收割：

```rust
loop {
    let deadline = Instant::now() + FLUSH_INTERVAL; // 2ms
    let mut batch = Vec::with_capacity(4096);
    while batch.len() < 4096 && Instant::now() < deadline {
        match rx.recv_timeout(deadline - Instant::now()) {
            Ok(rec) => batch.push(rec),
            Err(_) => break,
        }
    }
    sink.write(&batch)?;
}
```

2ms 的 flush 间隔是吞吐与延迟的甜点：再短吞吐上不去，再长 p99 延迟难看。

## 数据与复现

完整 benchmark 在仓库 `benches/` 目录，`cargo bench` 可复现。测试机：8C16T / NVMe / Linux 6.8。火焰图（`perf` + `inferno`）贴在 PR #87。

## 踩坑备忘

- MPSC 的 `recv_timeout` 在空队列时精度很差，自己用 `park_timeout` 控制更稳
- 有界队列的容量设为 2 的幂，配合位运算取模，又省了 3%
- 别迷信 `crossbeam`：我们的场景下 std 的 MPSC 反而更快，因为它少了我们不需要的 MPMC 能力

下一篇写 v0.4.0 的插件系统设计。
