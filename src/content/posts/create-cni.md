---
title: "创建简单的 CNI 插件"
date: "2024-04-11"
category: "tech"
tags: ["OSPP", "CNI", "Golang"]
summary: "用 Go 手写一个最小 CNI 插件:依据配置文件创建 bridge、为容器 netns 分配 IP,循序渐进打通容器网络通信。"
reading: "8 min"
---
> 使用 Golang 实现一个简易的 CNI 
> 对于 CNI 的功能实现将按照循序渐进的方式来进行
> 实现目标
>
> * 依据 config 文件创建 bridge 对象并分配 ns 对应的 ip 地址
> * 提供容器网络通信服务
>
> 实验的代码和脚本可以在 [IdeaMeshDyx/knetwork](https://github.com/IdeaMeshDyx/knetwork) 中找到

###  设计简易的 CNI 工作逻辑

由于 cni 提供的服务集中于节点的 L2/L3 层通信，所以基础的 cni 大致功能就是通过读取 config 文件配置在本地 Linux 环境当中给容器分配地址并通过 bridge 等设备建立通信能力。

依据上一篇[博客](https://ideameshdyx.github.io/2023/04/18/EdgeMesh/2023-ospp-fighting/CNI-Basic/)所学习到的 cni 规范，我们可以将 cni 的基础工作逻辑梳理如下：

1. kubelet 先创建 pause 容器创建对应的网络命名空间；
2. cri 或者是 cni 主程序根据配置调用具体的 CNI 插件，可以配置成 CNI 插件链来进行链式调用；
3. 当 CNI 插件被调用时，通过传入配置以及命令行参数来获得网络命名空间、容器的网络设备等必要信息，然后执行 ADD 、 DELETE 或者其他操作；
4. CNI 插件给 pause 容器配置正确的网络，pod 中其他的容器都是复用 pause 容器的网络；

* 当容器准备创建或被终止时，cni 插件被 cri 或者是其他的 cni 插件调用执行功能。
  * 当创建容器的时候，为容器分配网络资源，包括 IP 地址和网络连接
  * 当销毁容器的时候，删除为容器分配的所有网络资源
* cni 插件所获取的信息格式如下: (cri 调用或者是其他 cni 插件)
  * cni 执行的命令和操作(cni必须要实现的核心可调用功能)
    * ADD
    * DELETE
    * VERSION
    * CHECK
  * 容器ID(服务的容器对象ID)
  * 节点容器所连接网络空间的路径
  * 容器中需要创建的接口名称
  * 目前节点内 cni 可执行程序所在路径，一般其他的 cni 插件也在这个路径(一般是`/opt/cni/bin`)
  * cni 配置文件的路径

而对于节点运行的 cri 调用 cni 服务，需要在路径中设置 cni 可调用的地址。如果是在 Kubernetes 集群当中， cni 以容器的形式来提供服务就需要在其创建了对应的网桥提供服务之后，设置 cni 当中获取服务的地址为该网桥所在网段。
比如 Docker 当中设置 `vim /usr/lib/systemd/system/docker.service` 中 `--bip=10.244.12.1/24 ` 如下：

```bash
[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock --bip=10.244.12.1/24 --mtu=1450
ExecReload=/bin/kill -s HUP $MAINPID
TimeoutStartSec=0
RestartSec=2
Restart=always
```

### 代码实现

#### **Step1 : 创建 cni 主流程**

首先，一个基本的 cni 需要完成在容器创建时候，依据传入参数为其分配网络资源；同时需要在容器终止时候，删除所有分配的资源。
所以可以先得到一个最基本的 cni 主程序框架如下：

```go
package main 

import (
    "github.com/containernetworking/cni/pkg/skel"
    "github.com/containernetworking/cni/pkg/version"
)
func cmdAdd(args *skel.CmdArgs) error {
    /**
    TODO: add code about cmdAdd
    */
    // 测试是否 cni 接收到了传入的容器网络配置参数
    fmt.Printf("interfance Name: %s\n", args.IfName)
	  fmt.Printf("Netns path: %s\n", args.Netns)
	  fmt.Printf("The config data: %s\n", args.StdinData)
    return nil
}

func cmdDel(args *skel.CmdArgs) error {
    /**
    TODO: add code about cmdDel
    */
    return nil
}

func main(){
    skel.PluginMain(cmdAdd, cmdDel, cmdVersion, cmdCheck)
}

```

按照所归纳的 cni 逻辑，我们已经实现了一个基础的框架，并且可以接受传入的网络配置参数，但目前还没有执行任何的动作。

传入的参数具体内容定义在 `pkg/skel/skel.go`:

```go
// CmdArgs captures all the arguments passed in to the plugin
// via both env vars and stdin
type CmdArgs struct {
	ContainerID   string
	Netns         string
	IfName        string
	Args          string
	Path          string
	NetnsOverride string
	StdinData     []byte
}
```

当然 cni 接受参数的目的是去了解该创建怎样的容器网络。但是如何将这些参数传给 cni 呢？ 依据 cni 规范，我们需要从配置文件或者是 cri 传入参数中获取到对应的容器网络需求。顺带一提，在 Kubernetes 网络集群中，kubelet 也并不是直接与 cni 沟通的，所以 cni 本身可以在单节点上创建容器网络以及提供功能，只是说在集群当中可以结合 kubelet 提供 list/watch apiserver 的功能来做局域网内的地址管理和网络连通性，包括 ip capsulating， cidr 等等。

接下来为检验以上的功能逻辑通畅，创建以下 config 文件：

```yaml
{
	"name": "mynet",
	"BridgeName": "test",
	"IP": "192.0.2.1/24"
}
```

那么接下来就可以，模拟 cri 调用 cni 通过 config 文件指定所创建的容器网络配置创建资源，所使用的指令如下：

```bash
	go build -o example .
	echo "Ready to call the cni program and create resources"
	sudo CNI_COMMAND=ADD CNI_CONTAINERID=ns1 CNI_NETNS=/var/run/netns/ns1 CNI_IFNAME=eth10 CNI_PATH=`pwd` ./example < config
	echo "The CNI has been called, see the following results"
```

得到以下输出：

```bash
[root@master knet]# ./run.sh
Ready to call the cni program and create resources
interfance Name: eth10
netns path: /var/run/netns/ns1
the config data: {
        "name": "mynet",
        "BridgeName": "test",
        "IP": "192.0.2.1/24"
}
The CNI has been called, see the following results
```

通过这个测试可以明确以上代码可以从命令行当中读取出对应的配置参数，不过仅只是将结果输出而已并没有做更多的操作，当然这并不可能是完整的 cni ，那接下来进一步实现当 cni 获取了这些参数之后该做些什么。

#### **step2: 实现 cmdAdd 功能**

本文的目的还是在于理清楚 cni 执行的底层逻辑，所以就不深入探究 cni 的多样功能实现，所以以创建一个 Linux 网桥为目标，具体代码逻辑如下：

1. 从配置中读取网桥信息。
2. 获取我们想要使用的网桥名称。
3. 如果系统中不存在该网桥，则创建它。

由于 cni 的框架里面将配置内容以字节数组的形式存储在 CmdArgs 对象中，所以我们也应该创建一个结构来解码这些字节数组的数据，数据格式需要兼容规范的各类对象。

```go
// 简单的网桥结构
type SimpleBridge struct {
	BridgeName string `json:"bridgeName"`
	IP         string `json:"ip"`
}

// 在cmdAdd中解析传入的参数内容
func cmdAdd(args *skel.CmdArgs) error {

}

```

当把配置文件中的数据转化为代码当中的数据结构，接下来我们就需要使用这些数据调用内核接口创建对应的内核资源。就但从目前的实现目标创建 Linux 网桥来说，可以通过原始的 os.Exec 创建，不过这样就需要去深入到不同操作系统和内核的功能实现上，为覆盖这部分的复杂性，我们就直接借用开源的调用来实现这部分的功能

```go
/**
1. 准备好我们想要的 netlink.Bridge 对象。
2. 创建网桥对象
3. 设置Linux网桥参数
*/
br := &netlink.Bridge{
	LinkAttrs: netlink.LinkAttrs{
		Name: sb.BridgeName,
		MTU:  1500,
		// Let kernel use default txqueuelen; leaving it unset
		// means 0, and a zero-length TX queue messes up FIFO
		// traffic shapers which use TX queue length as the
		// default packet limit
		TxQLen: -1,
	},
}

err := netlink.LinkAdd(br)
if err != nil && err != syscall.EEXIST {
	return err
}

if err := netlink.LinkSetUp(br); err != nil {
	return err
}

```

> 当然， cni 的实质原理就是接入 Linux 内核的调用并创建内核资源，所以需要调用借助一些相关的调用，上述代码使用的是 cni 官方整理 `github.com/containernetworking/cni/pkg/skel` 。除此之外，本文还收集了相关的一些 Go 仓库来帮助接下来的项目推进。
> [netlink](https://github.com/vishvananda/netlink)
> [go-cni](https://github.com/containerd/go-cni/tree/main)
> [intel-cni](https://github.com/containerd/go-cni/tree/main)
> [sr-cni](https://github.com/containerd/go-cni/tree/main)

到这一步，代码就完成了对内核资源的创建和修改，接下来就是将这些将这些资源分配到需求的容器网络上。通过对于 Linux 网络的学习，我们可以想到一个非常简单的方法就是创建 veth 设备并将一端放入容器中，另一端插入到创建的网桥当中，这样网桥所连接的容器就都相当于共享同一个二层设备，划分到同一个子网当中。实际上大部分的 cni 也是同样的操作，不过仅仅设置一个单网桥对于高速网络或者是多功能多层次网络的服务可能稍显不足，这部分的功能会使用 eBPF 来作为补足。

说干就干，我们整理出一下需要继续添加到代码工程当中的逻辑：

1. 从我们之前创建的Bridge中获取Bridge对象
2. 获取容器的命名空间
3. 在容器上创建一个 veth，并将主机端 veth 移至主机 ns。
4. 将主机端 veth 附加到 linux bridge 上

在这个过程当中有一些地方需要注意：

* 需要检验已创建的网络资源，避免冲突
* 获取并处理容器的网络空间

这些问题如果是单独实现一个独立的 cni 插件，那么就不可避免需要考虑环境问题。(1) 怎样与其他的 cni 功能兼容或者是当检验到节点上有使用其他的 cni 插件，需要提醒用户卸载其他的 cni 插件再来安装配置. (2) 清除先前的程序遗留的网络配置参数和内容，保证不出现集群网络的资源冲突。(3) 分配资源的对象参数获取，这里其实指的就是容器网络。

这些麻烦都可以在对内核交互的调用中查询，此外还有其他的需求，也考虑在将来使用 eBPF 来做进一步的开发和补充。

```go
// 获取本地的网络设备情况
l, err := netlink.LinkByName(sb.BridgeName)
if err != nil {
    return fmt.Errorf("could not lookup %q: %v", sb.BridgeName, err)
}

// 比较是否有冲突的问题
newBr, ok := l.(*netlink.Bridge)
if !ok {
    return fmt.Errorf("%q already exists but is not a bridge", sb.BridgeName)
}
```

而对于容器网络信息的获取，在之前的指令中也涉及到`CNI_CONTAINERID=ns1 CNI_NETNS=/var/run/netns/ns1`,这部分信息可以通过传入的参数获取。

```go
netns, err := ns.GetNS(args.Netns)
if err != nil {
	return err
}
```

接下来对于每一个 `NetNs`对象（也就是容器对象），我们需要为它创建一个 veth 设备，并将它附加到创建的网桥上。

```go
// 设置 Handler ,为调用 handler 的容器创建 veth [此时 veth 的一端在容器内，另一端在 hostNS]
hostIface := &current.Interface{}
	var handler = func(hostNS ns.NetNS) error {
		hostVeth, _, err := ip.SetupVeth(args.IfName, 1500, hostNS)
		if err != nil {
			return err
		}
		hostIface.Name = hostVeth.Name
		return nil
}

// 为每一个容器调用 handler
if err := netns.Do(handler); err != nil {
		return err
}

// 获取所创建的 Bridge 
hostVeth, err := netlink.LinkByName(hostIface.Name)
	if err != nil {
		return err
}

// 将 veth 附加到创建的网桥上
if err := netlink.LinkSetMaster(hostVeth, newBr); err != nil {
		return err
}
```

在上述过程当中，我们通过 `hostIface.Name` 获得主机端 veth 对的接口名称，然后将该链接附加到之前创建的 Linux 网桥上； 接着通过调用 `netlink.LinkByName` 函数从接口名称中获取链接对象, 然后调用 `netlink.LinkSetMaster` 函数将链接连接到网桥上。

> 在操作过程中有一个非常重要的关注点： **确保操作系统不会在命名空间的操作中切换线程**
> 可以参考 [steps-in-context-switching](https://stackoverflow.com/questions/7439608/steps-in-context-switching) 
>
> 命名空间操作需要独占访问某些资源，如进程ID（PID）和网络接口。当一个命名空间被创建或销毁时，内核必须确保该命名空间所拥有的资源被正确分配或释放，并且对这些资源的任何操作都是同步的。
>
> 如果操作系统在命名空间操作进行时切换线程，可能会导致资源冲突或竞赛条件，这可能导致不可预测的行为或系统不稳定。例如，如果一个线程正在设置一个新的网络命名空间，而另一个线程同时试图使用同一个网络接口，这可能会导致资源争夺和数据损坏。
>
> 因此，为了确保命名空间操作的完整性和一致性，操作系统必须以原子方式和互斥方式执行命名空间操作。

所以我们使用以下方式限制,具体的使用手册是：
[benefits-of-runtime-lockosthread-in-golang](https://stackoverflow.com/questions/25361831/benefits-of-runtime-lockosthread-in-golang)
[go-pkg-runtime](https://pkg.go.dev/runtime)

```go
func init() {
        // this ensures that main runs only on main thread (thread group leader).
        // since namespace ops (unshare, setns) are done for a single thread, we
        // must ensure that the goroutine does not jump from OS thread to thread
        runtime.LockOSThread()
}
```

通过添加上述的代码，我们可以成功给多个 ns 容器提供自己的 veth 设备并接入网桥获取了连通性。然而每个容器依旧是在 L3 不通的，他们并没有唯一可以表示彼此的 IP 地址。 接下来，我们进一步来实验看看如何将 IP 地址分配给各自的容器。

IP 地址管理在集群中往往是结合 IPAM 插件实现相关的功能，通过接入 k8s apiserver 来同步和获取当前集群内的 IP 地址划分情况以及这些 IP 地址所分配到的节点地址。
这里的节点地址是提供给 k8s 建立集群的内网地址，也就是说如果是跨集群的情况，通过这样的方式 ip capsulated 使用的是节点地址，此时如果节点之间二层不可通的话，那么容器之间通过 PodIP 就无法找到彼此。

不过就本文实现的简易 cni 功能，我们仅通过配置文件来获取容器网络的配置信息，而实现对地址的分配依旧需要借助内核的调用，在此不再重复。但要强调的是，为简单实现，这部分的 IP 支持就仅涉及 IPV4，之后对于 IPV6可能借助 eBPF 实现能够兼容 SRV6 相关特性的 cni， 敬请期待。 

依据上述的逻辑，我们可以得到接下来的代码实现流程：

1. 依据配置中生成一个IP对象。
2. 在目标网络命名空间中调用netlink.AddrAdd。

那么接着看看 `netlink`  当中是如何实现他对于地址分配的呢？

```go
// 位于 addr.go
// Addr represents an IP address from netlink. Netlink ip addresses
// include a mask, so it stores the address as a net.IPNet.
type Addr struct {
	*net.IPNet
	Label       string
	Flags       int
	Scope       int
	Peer        *net.IPNet
	Broadcast   net.IP
	PreferedLft int
	ValidLft    int
	LinkIndex   int
}

// 位于 addr_linux.go
// AddrAdd will add an IP address to a link device.
//
// Equivalent to: `ip addr add $addr dev $link`
//
// If `addr` is an IPv4 address and the broadcast address is not given, it
// will be automatically computed based on the IP mask if /30 or larger.
func AddrAdd(link Link, addr *Addr) error {
	return pkgHandle.AddrAdd(link, addr)
}

// AddrAdd will add an IP address to a link device.
//
// Equivalent to: `ip addr add $addr dev $link`
//
// If `addr` is an IPv4 address and the broadcast address is not given, it
// will be automatically computed based on the IP mask if /30 or larger.
func (h *Handle) AddrAdd(link Link, addr *Addr) error {
	req := h.newNetlinkRequest(unix.RTM_NEWADDR, unix.NLM_F_CREATE|unix.NLM_F_EXCL|unix.NLM_F_ACK)
	return h.addrHandle(link, addr, req)
}

```

我们使用 golang 提供的 `net` 包来生成 `net.IPNet` 类型和它的CIDR形式（IP地址和Mask），然后通过 `net.ParseCIDR` 来解析配置文件中获取的IP字符串并返回一个 `net.IPNet` 的指针。而这几步都需要在创建对应网络资源的时候完成绑定，所以我们需要修改前面的处理程序，在创建 veth 时分配 IP 地址。由于从 `net.ParseCIDR` 得到的 `net.IPNet` 对象是子网而不是真正的 IP 地址，接下来需要依据此子网生成合适的 IP 地址重新分配。

```go
var handler = func(hostNS ns.NetNS) error {
    hostVeth, containerVeth, err := ip.SetupVeth(args.IfName, 1500, hostNS)
    if err != nil {
        return err
    }
    hostIface.Name = hostVeth.Name
    // 在这里创建 IP  地址对象
    ipv4Addr, ipv4Net, err := net.ParseCIDR(sb.IP)
    if err != nil {
        return err
    }

    link, err := netlink.LinkByName(containerVeth.Name)
    if err != nil {
        return err
    }
    // 创建 IP 地址
    ipv4Net.IP = ipv4Addr

    addr := &netlink.Addr{IPNet: ipv4Net, Label: ""}
    if err = netlink.AddrAdd(link, addr); err != nil {
        return err
    }
    return nil
}
```

到这里，一个基础且完整的 `cmdAdd` 就完成了，我们接着来测试他的功能，通过过以下指令来测试功能

```bash
# 删除先前创建的资源
sudo ip netns del ns1
sudo ifconfig test down
sudo brctl delbr test

# 重新创建 ns1 来模拟容器
sudo ip netns add ns1
go build -o example .

# 执行 cni 来生成地址
echo "Ready to call the cni to create ip for ns1"
sudo CNI_COMMAND=ADD CNI_CONTAINERID=ns1 CNI_NETNS=/var/run/netns/ns1 CNI_IFNAME=eth10 CNI_PATH=`pwd` ./example < config
echo "The CNI has been called, see the following results"
echo "The bridge and the veth has been attatch to"
sudo brctl show test
echo "The interface in the netns"
sudo ip netns exec ns1 ifconfig -a
```

执行的结果如下：

```bash
[root@master knet]# ./run.sh 
Cannot remove namespace file "/var/run/netns/ns1": No such file or directory
test: ERROR while getting interface flags: No such device
bridge test doesn't exist; can't delete it
Ready to call the cni to create ip for ns1
{test 192.0.2.15/24}
The CNI has been called, see the following results
The bridge and the veth has been attatch to
bridge name     bridge id               STP enabled     interfaces
test            8000.b6e6090625de       no              veth2a9d8a3d
The interface in the netns
eth10: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.0.2.15  netmask 255.255.255.0  broadcast 192.0.2.255
        inet6 fe80::477:7aff:fee3:a9b8  prefixlen 64  scopeid 0x20<link>
        ether 06:77:7a:e3:a9:b8  txqueuelen 0  (Ethernet)
        RX packets 1  bytes 90 (90.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 1  bytes 90 (90.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

lo: flags=8<LOOPBACK>  mtu 65536
        loop  txqueuelen 1000  (Local Loopback)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 0  bytes 0 (0.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0
```

可以看到IP地址已经设置到了接口eth10上，接着我们使用下面的命令将IP地址设置到linux网桥上，并使用ping命令来检查主机和目标网络命名空间之间的网络连接情况。

```bash
[root@master knet]# sudo ifconfig test 192.0.2.1
[root@master knet]# sudo ip netns exec ns1 ping 192.0.2.1
PING 192.0.2.1 (192.0.2.1) 56(84) bytes of data.
64 bytes from 192.0.2.1: icmp_seq=1 ttl=64 time=0.077 ms
64 bytes from 192.0.2.1: icmp_seq=2 ttl=64 time=0.044 ms
64 bytes from 192.0.2.1: icmp_seq=3 ttl=64 time=0.053 ms
64 bytes from 192.0.2.1: icmp_seq=4 ttl=64 time=0.045 ms
^C
--- 192.0.2.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, ti
```

> 主要参考文章：
> [Container Network Interface](https://www.hwchiu.com/introduce-cni-iii.html)
> [Create your CNI ](https://morven.life/posts/create-your-own-cni-with-golang/)
