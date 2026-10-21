---
title: "CNI 与 Pod 容器网络 —— Linux 网络视角"
date: "2024-04-11"
category: "tech"
tags: ["OSPP", "CNI", "Linux"]
summary: "从 Linux 网络命名空间出发回答三个问题:Pod 如何拿到 IP、集群内 IP 唯一性如何保证、容器流量如何转发。"
reading: "8 min"
---
## CNI 与  Pod 容器网络—— Linux 网络

> Pod 容器在 kubernetes 网络中是怎样获取他的地址的呢? 
>
> 如何保障 Pod IP 在整个集群当中的唯一性？
>
> 容器流量如何在所给的IP之间相互转发？

---

### 从 namespace 开始

namespace 技术是 Linux 内核提供的一项非常重要的功能，也是容器虚拟化的基础技术，通过构建系统资源的边界，形成一个相对封闭的资源区域，也就是大家认识的容器。Linux 提供的 namespace 包括以下几个方面：

```bash
       Linux provides the following namespaces:

       Namespace   Constant          Isolates
       Cgroup      CLONE_NEWCGROUP   Cgroup root directory
       IPC         CLONE_NEWIPC      System V IPC, POSIX message queues
       Network     CLONE_NEWNET      Network devices, stacks, ports, etc.
       Mount       CLONE_NEWNS       Mount points
       PID         CLONE_NEWPID      Process IDs
       User        CLONE_NEWUSER     User and group IDs
       UTS         CLONE_NEWUTS      Hostname and NIS domain name
```

其中网络名字空间(network namespace)是网络虚拟化技术的基础，也是本文最为关注的部分；现有的各项容器技术在实现他们各自的网络连接时所依赖的核心，所以要探究 Pod 网络和 CNI 就必须先从 network namespace 入手。

在 Linux 系统当中，每一个 network  namespace  都有他自己的网络设置，包括（routing table）路由表、（network interface）网络设备、（IP address）IP 地址等等，这样隔离的一个典型好处就是在不同的network namespace 之下程序可以绑定到同一个端口并保持各自的网络约束不变。与其他的 namespace 一样, network namspace 也可以调用 clone() API创建一个通用的 namespace, 然后传入 CLONE_NEWNET 参数来创建 network namespace。不过就简单配置来说， 可以使用 **netns** 执行对 networkname space  的各项增删改查。

依据 network namspace 划分出网络区域就像是创建网络通信的对端，但光有隔离出来的对象并不能构成网络；容器还要和外界进行网络联通才能提供服务。与实际网络场景不相同的是，没有物理实体的交换机和路由器，甚至可用的物理网卡也是受限的，那么如何能够在划分隔离出的区域之间提供通信呢？同时如何能够定位这些区域并让数据包能够正确地从一个 netns 中传输到另一个 netns呢？

---

### veth 的创建和连接

首先要清楚 veth-pairs， veth 是虚拟以太网卡（virtual Ethernet）的缩写，veth 设备总是成对出现的，也因此称之为 veth-pair。可以通过` ip link add veth0 type veth peer name veth1` 等指令来创建管理这些虚拟网卡，eg ：[从docker0开始](https://morningspace.github.io/tech/k8s-net-docker0/) ，[Deep dive into Linux Networking and Docker | Medium](https://medium.com/techlog/diving-into-linux-networking-and-docker-bridge-veth-and-iptables-a05eb27b1e72) 等文章就有讲到其作用和类似操作，不再复述。

但关键在于对于系统来说，veth到底是什么呢？是一个文件，进程还是描述符,他是否直接和物理网卡相关？它的工作原理是什么，是怎样来让容器之间相互通信的呢？接着来深入研究其内核当中的实现，具体参考：[veth(4) - Linux manual page (man7.org)](https://man7.org/linux/man-pages/man4/veth.4.html)，[linux/veth.c at master · torvalds/linux (github.com)](https://github.com/torvalds/linux/blob/master/drivers/net/veth.c)

veth的相关源码位于 `drivers/net/veth.c`中，其中的初始化入口是`veth_init`

```c
static __init int veth_init(void)
{
	return rtnl_link_register(&veth_link_ops);
}
```

初始化函数注册了`veth_link_ops`(veth 设备的操作方法)，它包含了 veth 设备的创建启动和删除等回调函数，具体结构如下:

```c
static struct rtnl_link_ops veth_link_ops = {
	.kind		= DRV_NAME,
	.priv_size	= sizeof(struct veth_priv),
	.setup		= veth_setup,
	.validate	= veth_validate,
	.newlink	= veth_newlink,
	.dellink	= veth_dellink,
	.policy		= veth_policy,
	.maxtype	= VETH_INFO_MAX,
	.get_link_net	= veth_get_link_net,
	.get_num_tx_queues	= veth_get_num_queues,
	.get_num_rx_queues	= veth_get_num_queues,
};
```

从 `kind` 到 `setup` 都是创建对应的数据结构并写入常量参数,所以创建的关键还是在 `veth_newlink`,`veth_dellink`，但二者的执行逻辑相关，所以只看其中一个。 

首先是 `veth_newlink`, 不过他的实现较长，只能抓取一部分关键拆分开来看：

```c
static int veth_newlink(struct net *src_net, struct net_device *dev,
			struct nlattr *tb[], struct nlattr *data[],
			struct netlink_ext_ack *extack)
{
    ...
    // 由于虚拟网络设备对是由两个网络设备组成,
    // dev 是虚拟网络设备对的其中一个网络设备，不可能创建单独的设备，那就需要创建一个临时的对端 peer
    // 因而调用 rtnl_create_link 函数创建对端网络设备的逻辑对象 peer 
	peer = rtnl_create_link(net, ifname, name_assign_type,
				&veth_link_ops, tbp, extack);
	err = register_netdevice(peer);
    ...
    // 注册 dev 对象，本质上就在内存里面建立一个 struct 并将信息从文件映射过去
	err = register_netdevice(dev);

    ...
    // 把 peer 和 dev 关联到一起
	priv = netdev_priv(dev);               // 获取 dev 的私有数据部分
	rcu_assign_pointer(priv->peer, peer);  // 将其 peer 字段指向 dev
	err = veth_init_queues(dev, tb);
	priv = netdev_priv(peer);              // 获取 peer 的私有数据部分
	rcu_assign_pointer(priv->peer, dev);   // 将其 peer 字段指向 dev
    ...
	err = veth_init_queues(peer, tb);
    
    // 添加 XDP 访问支持 --> veth 在内核运行流程中接近网卡
    ...
	/* update XDP supported features */
	veth_set_xdp_features(dev);
	veth_set_xdp_features(peer);
    ...
}
```

在`veth_newlink`当中通过**`register_netdevice`** 注册了两个网络虚拟设备： `peer` 和 `dev`，并通过让 `dev` 的 peer 指针指向创建的 peer，让`peer` 的 peer  指针指向 dev，来完成了 veth 设备的结对。这个过程是符合 veth 的工作逻辑的，由于  veth 总是成对出现，所以在生成新的 veth 时候就需要指定它所连接对端  peer，当然这个过程发生在内核运行当中，并不是有物理上的连接关系，直白来说就是依据文件信息写入到内存，开辟一个空间来存储对应的信息，然后修改指针指向来表示连接关系。

创建完成之后，veth 又是怎么来传输数据的呢？回到之前的 `veth_setup`,启动 veth 的流程，也是将各类函数注册指定到 veth 对象当中

```c
static void veth_setup(struct net_device *dev)
{
	ether_setup(dev);
    ...
	dev->netdev_ops = &veth_netdev_ops;
	dev->xdp_metadata_ops = &veth_xdp_metadata_ops;
	dev->ethtool_ops = &veth_ethtool_ops;
    ...
}
```

可以看到是 veth 对象的操作列表包含三类：`veth_netdev_ops`,`veth_xdp_metadata_ops`,`veth_ethtool_ops`, 具体的列表如下：

net_device_ops 结构是网络设备的操作函数集结构, 包含了 Linux 网络设备对象的各项操作行为列表，也是  veth 对象调用实现功能的具体行为。

从以下列表其实可以知道，Linux 设备是通用一个网卡的代码数据操作流程及对象的，以下的操作函数对于 ebpf xdp 程序直接操作有一定参考，是EdgeMesh 为来优化的对象，故进一步深入探究。

```c
static const struct net_device_ops veth_netdev_ops = {
	.ndo_init            = veth_dev_init,
	.ndo_open            = veth_open,
	.ndo_stop            = veth_close,
	.ndo_start_xmit      = veth_xmit,
	.ndo_get_stats64     = veth_get_stats64,
	.ndo_set_rx_mode     = veth_set_multicast_list,
	.ndo_set_mac_address = eth_mac_addr,
#ifdef CONFIG_NET_POLL_CONTROLLER
	.ndo_poll_controller	= veth_poll_controller,
#endif
	.ndo_get_iflink		= veth_get_iflink,
	.ndo_fix_features	= veth_fix_features,
	.ndo_set_features	= veth_set_features,
	.ndo_features_check	= passthru_features_check,
	.ndo_set_rx_headroom	= veth_set_rx_headroom,
	.ndo_bpf		= veth_xdp,
	.ndo_xdp_xmit		= veth_ndo_xdp_xmit,
	.ndo_get_peer_dev	= veth_peer_dev,
};
```

这些函数的具体作用如下整理：

- `ndo_init`: 该函数指向 `veth_dev_init`，网络设备初始化函数，由驱动程序实现，在网卡设备分配之后调用。

- `ndo_open`: 该函数指向 `veth_open`，被调用以打开虚拟网络设备并将其加入网络协议栈，由驱动程序实现，用于开启网络设备并为进程提供网络访问。
- `ndo_stop`：该函数指向 `veth_close`，由驱动程序实现，被调用以停止虚拟网络设备并将其从网络协议栈中移除。
- ==`ndo_start_xmit`：该函数指向 `veth_xmit`，由驱动程序实现，用于将给定的网络数据帧发送到指定的网络设备上。==
- `ndo_get_stats64`：该函数指向 `veth_get_stats64`，由驱动程序实现，用于获取虚拟网络设备当前的统计信息。
- `ndo_set_rx_mode`：该函数指向 `veth_set_multicast_list`，由驱动程序实现，用于设置网络设备接收模式。
- `ndo_set_mac_address`：该函数指向 `eth_mac_addr`，用于设置虚拟网络设备的MAC地址。
- `ndo_poll_controller`：该函数指向 `veth_poll_controller`，由驱动程序实现，veth调用之后触发软中断从 Ringbuffer 当中 poll 数据包
- `ndo_get_iflink`：该函数指向 `veth_get_iflink`，用于获取虚拟网络设备的网络接口索引号。
- `ndo_fix_features`：该函数指向 `veth_fix_features`，用于设置虚拟网络设备的特性参数；
- `ndo_set_features`：该函数指向 `veth_set_features`，用于修改或更新虚拟网络设备已经打开的特性参数。
- `ndo_features_check`：该函数指向 `passthru_features_check`，检查虚拟网络设备是否包含由 ETS（Enhanced Traffic Service）要求的特征。
- `ndo_set_rx_headroom`: 该函数指向 `veth_set_rx_headroom`，用于设置虚拟网络设备中下行数据帧包头部的大小。
- `ndo_bpf`：该函数指向 `veth_xdp`，用于添加eBPF扩展程序入口并进行初始化。
- `ndo_xdp_xmit`: 该函数指向 `veth_ndo_xdp_xmit`，驱动程序的XDP传输方法入口，将网络数据帧发送到用户提供的XDP扩展程序。
- `ndo_get_peer_dev`: 该函数指向 `veth_peer_dev`，用于获取与虚拟网络设备配对的网络设备。 

`ethtool_ops`结构则代表了与`ethtool`工具相关的网络设备操作函数集合。`ethtool`用于获取和设置与`ethtool`兼容设备的驱动程序和硬件信息，同时实现均衡网速，流量控制等功能。

```c
static const struct ethtool_ops veth_ethtool_ops = {
	.get_drvinfo		= veth_get_drvinfo,
	.get_link		= ethtool_op_get_link,
	.get_strings		= veth_get_strings,
	.get_sset_count		= veth_get_sset_count,
	.get_ethtool_stats	= veth_get_ethtool_stats,
	.get_link_ksettings	= veth_get_link_ksettings,
	.get_ts_info		= ethtool_op_get_ts_info,
	.get_channels		= veth_get_channels,
	.set_channels		= veth_set_channels,
};
```

`xdp_metadata_ops`结构体定义了XDP（eBPF based packet processing）元数据的操作集合，在实现高性能网络数据包处理、过滤和转发的过程中起到重要作用。该操作集与XDP引擎密切相关，包括xsk_frame_parse（对接收的数据包的元数据进行解析）和xsk_frame_init（初始化元数据）等。

```c
static const struct xdp_metadata_ops veth_xdp_metadata_ops = {
	.xmo_rx_timestamp		= veth_xdp_rx_timestamp,
	.xmo_rx_hash			= veth_xdp_rx_hash,
};
```

- `xmo_rx_timestamp` ： 该函数指针指向 `veth_xdp_rx_timestamp` 函数，用于获取 XDP 包的接收时间戳，即处理 XDP 包的内核进程把包抓取的时间。该时间可以在 eBPF 程序中使用，例如可用于实现延迟测量(metric)，排除处理器竞争以及路由表测量等。

- `xmo_rx_hash`：该函数指针指向 `veth_xdp_rx_hash`，用于获取 XDP 数据包的接收哈希值。通过接收哈希值，可以在 eBPF 中就各个数据包的接收位置和网络环境进行更好的控制和调节，以优化网络性能。例如在基于哈希的负载均衡中，可以使用哈希值来决定要将数据包路由到哪个接收 CPU 或内核上。

在 Linux 中，这些函数指针被定义为可选项，也就是说并非每个驱动程序都会实现这两个函数指针。`xdp_metadata_ops` 使驱动程序与 eBPF程序 在处理特定的数据包和流量时更加灵活；但反过来说也需要配备一定的环境才能够实现这些调用的功能。

到这里，veth 的创建和各项功能在 Linux 视角的样子就全部呈现了，总的来说 veth 本身是 Linux 中创建的 `net_device` 结构，通过注册所需的初始化和操作行为等特定函数以及对其进行相应的参数配置，最终实例化为 veth 对象，用于虚拟网络的构建。同时更明确了 veth 是工作在二层的数据结构，他传输数据会调用驱动程序实现的 `ndo_start_xmit`函数，在指定了对端之后，数据包发送会存入 skb 并插入 `softnet_data->input_pkt_queue`中，出发软中断，接下来就是对称一般的内核接收过程。

---

### 网桥的连接和传输

veth 可以感性地认知为网卡，它给予了所划分出的 network namspace 一个出入的门，此前的结构如果将 veth 分别指向两个网络空间，就能够实现这二者的通信，但是当所划分的网络空间区域增加的时候，这样子点对点的连接方式显然就很难支撑了。

这样就需要解决单节点大量容器之间的网络互连问题。

参考实际物理网络的结构，Linux 实现并提供了一个完全由软件虚拟出来的交换机，它可以提供很多的虚拟端口，把许多的 veth 连接在一个平面的网络，通过自己的转发功能让虚拟机网卡之间可以通信，这个技术就叫做 bridge。

如何使用 bridge 连接不同的网络空间呢？[Introduction to Linux interfaces for virtual networking | Red Hat Developer](https://developers.redhat.com/blog/2018/10/22/introduction-to-linux-interfaces-for-virtual-networking#team_device)，[Deep dive into Linux Networking and Docker - Bridge, vETH and IPTables - DEV Community](https://dev.to/arriqaaq/diving-into-linux-networking-and-docker-bridge-veth-and-iptables-419a)  等文章也有详尽阐述，不再复述。

其中要关注的点是： bridge 的工作源码都是在 /net/core/dev.c 或者是 /net/bridge 目录下面，也就是说他是工作在二层上的设备（这一点与物理交换相同），但所给的实验来验证连通性是依靠 ping 指令从IP来看的，但这并不意味着 bridge 是依靠 IP  来做转发的。

为了验证这一点，深入来看 bridge 的内核实现

从外部网络到达节点时候，数据包会被网卡先送到 RingBuffer 中，然后依次经过硬中断、软中断处理，在软中断中再以此把包送到设备层（连接bridge）、协议栈，最后唤醒应用程序。

从节点内的应用程序到达外部的时候，会从应用程序调用系统调用，在进入协议栈（传输层、网络层），再进入邻居子系统到网络设备子系统（bridge），之后调用驱动程序触发硬中断到网卡。

在这个过程中，bridge 输入数据包处理工作流程在 `/net/bridge/br_input.c` 中 `br_handle_frame_finish`函数里

```c
int br_handle_frame_finish(struct net *net, struct sock *sk, struct sk_buff *skb)
{
    // 获取 veth 所连接的网桥端口以及 bridge 设备
	struct net_bridge_port *p = br_port_get_rcu(skb->dev);
    // 创建转发表对象
	struct net_bridge_fdb_entry *dst = NULL;
    
	struct net_bridge_mcast_port *pmctx;
	struct net_bridge_mdb_entry *mdst;
	struct net_bridge_vlan *vlan;
	struct net_bridge *br;
	br = p->br;
    
    // 查找并更新转发表，这个转发表使用的地址是eth_hdr(skb)->h_source
	br_fdb_update(br, p, eth_hdr(skb)->h_source,vid, BIT(BR_FDB_LOCKED));	
	dst = br_fdb_find_rcu(br, eth_hdr(skb)->h_dest, vid);
    
    // 转发
	if (dst) {
		br_forward(dst->dst, skb, local_rcv, false);
    // 本机访问
	if (local_rcv)
		return br_pass_frame_up(skb);
}
```

其中查找和转发使用的地址是eth_hdr(skb)->h_dest，和物理环境当中的交换机会自动学习端口所对应的节点mac地址一样，软件模拟的 bridge 也会自学习 veth 与 eth_hdr 的对应关系。

总的来说，当创建了 bridge 并把 veth 设备放入其中，网桥就能够为连接的网络空间提供一个平面的网络连接服务。

其实到目前为止，所涉及的网络设备都工作在二层，对应到物理环境就是都使用的 MAC 地址进行寻址和交换信息，这样的网络服务就是 Linux  基本网络服务，能够实现单节点上的网络空间连通性。

可只是这样是无法满足Kubernetes 集群的网络寻址和路由需求的，现有的网络追求平面式的连接服务但是底层依旧还是得通过IP进行寻址；回到容器网络当中，这也意味着希望在容器网络当中的实体能够拥有各自独立、唯一的IP地址，可以是容器、物理机或者是其他的网络设备（比如虚拟路由器）等，容器可以被添加到一个或多个网络中或从一个或多个网络中删除。这就是接下来 CNI 需要满足的功能之一。

---
