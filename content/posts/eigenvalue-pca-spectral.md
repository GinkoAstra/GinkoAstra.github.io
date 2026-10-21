## 先忘掉定义，看一个优化问题

手头有 $n$ 个 $p$ 维数据点，已经中心化，排成矩阵 $X \in \mathbb{R}^{n \times p}$。PCA 的目标：找一个单位方向 $w$（$\|w\| = 1$），使数据投影到 $w$ 后的方差最大。

投影坐标是 $Xw$，方差正比于：

$$\|Xw\|^2 = w^\top X^\top X\, w = w^\top S\, w, \qquad S = X^\top X$$

问题变成：

$$\max_{w:\,\|w\|=1} w^\top S\, w$$

拉格朗日乘子法：令 $\mathcal{L}(w, \lambda) = w^\top S w - \lambda(w^\top w - 1)$，对 $w$ 求梯度并置零：

$$\nabla_w \mathcal{L} = 2Sw - 2\lambda w = 0 \;\Longrightarrow\; Sw = \lambda w$$

**特征值方程自己从优化问题里长出来了。** 没有人发明它，它是"方差最大化"这个朴素目标的必然推论。而且最优值 $w^\top S w = \lambda w^\top w = \lambda$——最大方差就是最大特征值，最优方向就是对应的特征向量。

## 特征值的几何面孔：振动模态

矩阵 $A$ 作用在一般向量上，是旋转加拉伸的混合体，很难描述。但作用在特征向量上只做一件事：**沿原方向伸缩 $\lambda$ 倍**。

$$A v = \lambda v$$

如果把 $A$ 想成一个物理系统（振动膜、弹簧网络、马尔可夫链的一步转移），特征向量就是系统的**模态**——系统演化时保持形状不变、只改变幅度的那些特殊状态。所有其他状态都是模态的叠加。这就是为什么从结构力学到 PageRank，到处都是特征值。

## 谱定理：对称矩阵的温柔之处

PCA 里 $S = X^\top X$ 是实对称矩阵。谱定理断言：

> 实对称矩阵必可正交对角化：$S = Q\Lambda Q^\top$，其中 $Q$ 的列是两两正交的单位特征向量，$\Lambda = \operatorname{diag}(\lambda_1, \dots, \lambda_p)$ 全为实数。

为什么对称性这么关键？看两个不同特征值 $\lambda_1 \neq \lambda_2$ 对应的特征向量 $v_1, v_2$：

$$\lambda_1 \langle v_1, v_2 \rangle = \langle Sv_1, v_2 \rangle = \langle v_1, S^\top v_2 \rangle = \langle v_1, Sv_2 \rangle = \lambda_2 \langle v_1, v_2 \rangle$$

中间那步用了对称性 $S = S^\top$。于是 $(\lambda_1 - \lambda_2)\langle v_1, v_2 \rangle = 0$，而 $\lambda_1 \neq \lambda_2$，只能 $\langle v_1, v_2 \rangle = 0$。**不同特征值的特征向量自动正交**——谱定理的核心论断，四行就证完了。对称性就是那个让内积"左右横跳"的魔术条件。

## 回到 PCA：一切都在谱定理里

对 $S$ 做谱分解 $S = Q\Lambda Q^\top$，主成分方向就是 $Q$ 的列；第 $k$ 个主成分解释的方差占比：

$$\frac{\lambda_k}{\lambda_1 + \lambda_2 + \cdots + \lambda_p}$$

分子分母都是特征值。降维保留前 $k$ 个主成分，等价于只保留谱分解里最大的 $k$ 项——这是 Eckart–Young 定理告诉我们的最优低秩逼近：

$$S_k = \sum_{i=1}^{k} \lambda_i\, q_i q_i^\top = \arg\min_{\operatorname{rank}(B) \le k} \|S - B\|_F$$

## 一张地图

特征值的版图远比 PCA 大：

- **微分方程**：$\dot{x} = Ax$ 的稳定性由特征值实部符号决定
- **图论**：拉普拉斯矩阵第二小特征值（Fiedler 值）度量图的连通性
- **量子力学**：可观测量是厄米算子，测量值是其特征值——谱定理的无穷维版本
- **数值计算**：条件数 $\kappa = |\lambda_{\max}| / |\lambda_{\min}|$ 决定解方程的精度损失

考试里它是计算题，世界里它是坐标系。下一篇写奇异值分解：当矩阵不再对称，谱定理如何退化成 SVD。
