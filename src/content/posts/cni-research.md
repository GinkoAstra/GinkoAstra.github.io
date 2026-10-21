---
title: "CNI Plugins 调研"
date: "2024-04-11"
category: "tech"
tags: ["OSPP", "CNI", "Linux"]
summary: "官方维护的 CNI 插件全景:Main(创建接口)/ IPAM(地址分配)/ Meta(能力叠加)三类插件的分工与能力边界。"
reading: "3 min"
---
## CNI Plugins 调研

### 1. 通用 CNI 插件

> 主要基于 [containernetworking/plugins: Some reference and example networking plugins, maintained by the CNI team. (github.com)](https://github.com/containernetworking/plugins) ，[CNI](https://www.cni.dev/plugins/current/)

由CNI 官方社区维护的 CNI plugins 主要分为三类：

* `Main: interface-creating`: 主进程 CNI ,直接与 Linux 交流，创建接口、网络空间、对象等
* `IPAM: IP address allocation`:  地址管理插件，主要负责 IP 地址管理和分配
* `Meta: other plugins`: 其他的功能插件

#### Main: interface-creating  主进程 CNI 

#### [`bridge`](https://www.cni.dev/plugins/current/main/bridge/) 

​	创建虚拟网桥，并把本机（host）和容器（更准确说是network namespace）添加到其中

#### [`macvlan`](https://www.cni.dev/plugins/current/main/macvlan/)

​	创建一个新的 MAC 地址，将相关容器的所有流量都转发到该地址

#### [`ipvlan`](https://www.cni.dev/plugins/current/main/ipvlan/) 

​	类似于 `macvlan`创建虚拟局域网连接，给容器增加 [ipvlan ](https://www.kernel.org/doc/Documentation/networking/ipvlan.txt)接口，他主要有两种模式：

- L2 模式：  TX 流程完成在容器内的网络堆栈，之后数据包就会传输到本机队列等待发送，这个模式下容器网络可以进行RX/TX多播和广播（如本机启用的话）。
- L3 模式：容器网络仅能够处理 L3 网络流程，数据包先在容器内处理到 L3，然后再由主设备进行 L2 的处理和路由，再发送出去。这个模式创建的容器网络与本机共享同一个 L2 设备，所以容器网络将不会接收多播/广播流量，也无法发送多播/广播流量

这个模式创建对象的例子

```c
  +=============================================================+
  |  Host: host1                                                |
  |                                                             |
  |                                                             |
  |   +----------------------+      +----------------------+    |
  |   |   NS:ns0             |      |  NS:ns1              |    |
  |   |                      |      |                      |    |
  |   |                      |      |                      |    |
  |   |        ipvl0         |      |         ipvl1        |    |
  |   +----------#-----------+      +-----------#----------+    |
  |              #                              #               |
  |              ################################               |
  |                              # eth0                         |
  +==============================#==============================+
（a） 创建两个网络命名空间 - ns0、ns1
		IP 网络添加 NS0
		IP 网络添加 NS1

（b） 在 eth0（主设备）上创建两个 ipvlan 从站。
		IP 链路添加链路 eth0 IPvl0 类型 IPvlan 模式 L2
		IP 链路添加链路 eth0 IPvl1 类型 IPvlan 模式 L2

（c） 将从属服务器分配到相应的网络命名空间
		IP link set dev ipvl0 netns ns0
		IP link set dev ipvl1 netns ns1

（d） 现在切换到命名空间（ns0 或 ns1）以配置从属设备
		- 对于 ns0
			（1） IP netns exec ns0 bash
			（2） IP 链路设置开发 IPvl0 向上
			（3） IP 链路设置开发
			（4） IP -4 地址添加 127.0.0.1 开发 LO
			（5） IP -4 地址添加 $IPADDR 开发 IPvl0
			（6） IP -4 路由通过$ROUTER开发 IPvl0 添加默认值
		- 对于 ns1
			（1） IP Netns exec NS1 Bash
			（2） IP 链路设置开发 IPvl1 向上
			（3） IP 链路设置开发
			（4） IP -4 地址添加 127.0.0.1 开发 LO
			（5） IP -4 地址添加 $IPADDR 开发 IPvl1
			（6） IP -4 路由通过$ROUTER开发 IPvl1 添加默认值
```

#### [`ptp`](https://www.cni.dev/plugins/current/main/ptp/) 

​	该插件只会创建 veth 对

#### [`host-device`](https://www.cni.dev/plugins/current/main/host-device/)

​	将现有的网络设备移动到容器中

#### [`vlan`](https://www.cni.dev/plugins/current/main/vlan/) 

​	将会创建一个独立于宿主机的 vxlan 网络接口

#### Windows: windows specific 

##### [`win-bridge`](https://www.cni.dev/plugins/current/main/win-bridge/) 

 	创建虚拟网桥并把本机和（单个）容器连接到这个网桥上

##### [`win-overlay`](https://www.cni.dev/plugins/current/main/win-overlay/) 

​	创建 overlay 接口给 容器

---

### 2. IPAM 插件

#### [`dhcp`](https://www.cni.dev/plugins/current/ipam/dhcp/) 

​	给对应容器创建守护进程，这个进程用于发送DHCP请求给网关

#### [`host-local`](https://www.cni.dev/plugins/current/ipam/host-local/) 

​	依据宿主机的网络信息来分配IP地址，会维护一个描述本机配置的数据文件

#### [`static`](https://www.cni.dev/plugins/current/ipam/static/) 

​	分配指定条件的IPv4 和IPv6地址给容器

---

### 3. Meta 多功能插件

#### [`tuning`](https://www.cni.dev/plugins/current/meta/tuning/) 

​	改变现有网络接口的 `sysctl` 参数

#### [`portmap`](https://www.cni.dev/plugins/current/meta/portmap/)

​	使用 iptables 的端口映射插件，建立从宿主机到容器的端口映射

#### [`bandwidth`](https://www.cni.dev/plugins/current/meta/bandwidth/) 

​	使用流量控制tbf（token-bucket filter），通过限制入口和出口流量从而控制带宽

#### [`sbr`](https://www.cni.dev/plugins/current/meta/sbr/)

 	为网络设备提供源路由的配置功能

#### [`firewall`](https://www.cni.dev/plugins/current/meta/firewall/) 

通过 `iptables` 增添路由规则来控制允许出入容器的流量

以上这些基础插件的代码位置位于：[plugins/plugins at main · containernetworking/plugins (github.com)](https://github.com/containernetworking/plugins/tree/main/plugins)

### 第三方 CNI 插件

第三方插件的实现方式较多，尤其是在上述的这些基础 CNI 仅仅能够满足单节点容器地址管理划分创建需求的情况下，依据不同操作系统、不同需求的网络规模和网络规则创建，CNI 的功能和使用也就多种多样了。

为了能够明确插件的实际功能，本文将主要依据功能的不同给 CNI 做一个标签，并整理他们使用时的规范和方法。

#### [Project Calico - a layer 3 virtual network](https://github.com/projectcalico/calico)

> 

仓库位置是：[calico/cni-plugin at master · projectcalico/calico (github.com)](https://github.com/projectcalico/calico/tree/master/cni-plugin)

相关文档是：[Configure the Calico CNI plugins | Calico Documentation (tigera.io)](https://docs.tigera.io/calico/latest/reference/configure-cni-plugins)

#### [Weave - a multi-host Docker network](https://github.com/weaveworks/weave)

仓库位置是：[weave/plugin at master · weaveworks/weave (github.com)](https://github.com/weaveworks/weave/tree/master/plugin)

相关文档是：[Integrating Kubernetes and Mesos via the CNI Plugin (weave.works)](https://www.weave.works/docs/net/latest/kubernetes/)

#### [Cilium - BPF & XDP for containers](https://github.com/cilium/cilium)

仓库位置是：[cilium/plugins/cilium-cni at main · cilium/cilium (github.com)](https://github.com/cilium/cilium/tree/main/plugins/cilium-cni)

相关文档是：[CNI Chaining — Cilium 1.13.2 documentation](https://docs.cilium.io/en/stable/installation/cni-chaining/#id1)

#### [Contiv Networking - policy networking for various use cases](https://github.com/contiv/netplugin)

仓库位置是：[contiv/netplugin: Container networking for various use cases (github.com)](https://github.com/contiv/netplugin)

相关文档是：无

#### [SR-IOV](https://github.com/hustcat/sriov-cni)

仓库位置是：[hustcat/sriov-cni: SR-IOV CNI plugin (github.com)](https://github.com/hustcat/sriov-cni)

相关文档是：[What is SR-IOV? - Scott's Weblog - The weblog of an IT pro focusing on cloud computing, Kubernetes, Linux, containers, and networking (scottlowe.org)](https://blog.scottlowe.org/2009/12/02/what-is-sr-iov/)

#### [Infoblox - enterprise IP address management for containers](https://github.com/infobloxopen/cni-infoblox)

仓库位置是：[infobloxopen/cni-infoblox: CNI Infoblox Code (github.com)](https://github.com/infobloxopen/cni-infoblox)

相关文档是：[CNI Networking and IPAM (infoblox.com)](https://blogs.infoblox.com/community/cni-networking-and-ipam/)

#### [Multus - a Multi plugin](https://github.com/k8snetworkplumbingwg/multus-cni)

仓库位置是：[k8snetworkplumbingwg/multus-cni: A CNI meta-plugin for multi-homed pods in Kubernetes (github.com)](https://github.com/k8snetworkplumbingwg/multus-cni)

相关文档是：[multus-cni/how-to-use.md at master · k8snetworkplumbingwg/multus-cni (github.com)](https://github.com/k8snetworkplumbingwg/multus-cni/blob/master/docs/how-to-use.md)

#### [Romana - Layer 3 CNI plugin supporting network policy for Kubernetes](https://github.com/romana/kube)

仓库位置是：[romana/kube: Kubernetes specific components for Romana (github.com)](https://github.com/romana/kube)

相关文档是：[romana/romana: The Romana Project - Installation scripts, documentation, issue tracker and wiki. Start here. (github.com)](https://github.com/romana/romana)

#### [CNI-Genie - generic CNI network plugin](https://github.com/Huawei-PaaS/CNI-Genie)

仓库位置是：[huawei-cloudnative/CNI-Genie: CNI-Genie for choosing pod network of your choice during deployment time. Supported pod networks - Calico, Flannel, Romana, Weave (github.com)](https://github.com/huawei-cloudnative/CNI-Genie)

相关文档是：同一仓库

#### [Nuage CNI - Nuage Networks SDN plugin for network policy kubernetes support](https://github.com/nuagenetworks/nuage-cni)

仓库位置是：[nuagenetworks/nuage-cni: Nuage VSP plugin for the CNI project (github.com)](https://github.com/nuagenetworks/nuage-cni)

相关文档是：同一仓库

#### [Silk - a CNI plugin designed for Cloud Foundry](https://github.com/cloudfoundry-incubator/silk)

仓库位置是：[cloudfoundry/silk: a network fabric for containers. inspired by flannel, designed for Cloud Foundry. (github.com)](https://github.com/cloudfoundry/silk)

相关文档是：同一位置

#### [Linen - a CNI plugin designed for overlay networks with Open vSwitch and fit in SDN/OpenFlow network environment](https://github.com/John-Lin/linen-cni)

仓库位置是：[John-Lin/linen-cni: A CNI plugin designed for overlay networks with Open vSwitch (github.com)](https://github.com/John-Lin/linen-cni)

相关文档是：同一仓库

#### [Vhostuser - a Dataplane network plugin - Supports OVS-DPDK & VPP](https://github.com/intel/vhost-user-net-plugin)

仓库位置是：[intel/userspace-cni-network-plugin (github.com)](https://github.com/intel/userspace-cni-network-plugin)

相关文档是：[Userspace CNI Design document - Google 文档](https://docs.google.com/document/d/1jAFDNWhf6flTlPHmbWavlyLrkFJtAdQlcOnG3qhRYtU/edit#heading=h.jj69b7nmami)

#### [Amazon ECS CNI Plugins - a collection of CNI Plugins to configure containers with Amazon EC2 elastic network interfaces (ENIs)](https://github.com/aws/amazon-ecs-cni-plugins)

仓库位置是：[aws/amazon-ecs-cni-plugins: Networking Plugins repository for ECS Task Networking (github.com)](https://github.com/aws/amazon-ecs-cni-plugins)

相关文档是：[What is Amazon Elastic Container Service? - Amazon Elastic Container Service](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html)

#### [Bonding CNI - a Link aggregating plugin to address failover and high availability network](https://github.com/Intel-Corp/bond-cni)

仓库位置是：[k8snetworkplumbingwg/bond-cni: Bond-cni is for fail-over and high availability of networking in cloudnative orchestration (github.com)](https://github.com/k8snetworkplumbingwg/bond-cni)

相关文档是：同一位置

#### [ovn-kubernetes - an container network plugin built on Open vSwitch (OVS) and Open Virtual Networking (OVN) with support for both Linux and Windows](https://github.com/openvswitch/ovn-kubernetes)

仓库位置是：[ovn-org/ovn-kubernetes: Kubernetes integration for OVN (github.com)](https://github.com/ovn-org/ovn-kubernetes)

相关文档是：[Installing Open vSwitch — Open vSwitch 3.1.90 documentation](https://docs.openvswitch.org/en/latest/intro/install/)

#### [Juniper Contrail](https://www.juniper.net/cloud) / [TungstenFabric](https://tungstenfabric.io/) - Provides overlay SDN solution, delivering multicloud networking, hybrid cloud networking, simultaneous overlay-underlay support, network policy enforcement, network isolation, service chaining and flexible load balancing

仓库位置是：[Enterprise IT Networking Products & Solutions | Juniper Networks US](https://www.juniper.net/us/en/it-networking.html)

相关文档是：[Juniper Networks Brings More Simplicity, Scale and Security to Enterprise Networking with Three-Step Campus Fabric Workflow and New EX Distribution Switch | Juniper Networks Inc.](https://newsroom.juniper.net/news/news-details/2023/Juniper-Networks-Brings-More-Simplicity-Scale-and-Security-to-Enterprise-Networking-with-Three-Step-Campus-Fabric-Workflow-and-New-EX-Distribution-Switch/default.aspx)

> 无法参考，为保证资料完整性留存

#### [Knitter - a CNI plugin supporting multiple networking for Kubernetes](https://github.com/ZTE/Knitter)

仓库位置是：[ZTE/Knitter: Kubernetes network solution (github.com)](https://github.com/ZTE/Knitter)

相关文档是：[Knitter/docs at master · ZTE/Knitter (github.com)](https://github.com/ZTE/Knitter/tree/master/docs)

#### [DANM - a CNI-compliant networking solution for TelCo workloads running on Kubernetes](https://github.com/nokia/danm)

仓库位置是：[nokia/danm: TelCo grade network management in a Kubernetes cluster (github.com)](https://github.com/nokia/danm)

相关文档是：[danm/deployment-guide.md at master · nokia/danm (github.com)](https://github.com/nokia/danm/blob/master/deployment-guide.md)

#### [VMware NSX – a CNI plugin that enables automated NSX L2/L3 networking and L4/L7 Load Balancing; network isolation at the pod, node, and cluster level; and zero-trust security policy for your Kubernetes cluster.](https://docs.vmware.com/en/VMware-NSX-T/2.2/com.vmware.nsxt.ncp_kubernetes.doc/GUID-6AFA724E-BB62-4693-B95C-321E8DDEA7E1.html)

仓库位置是：[weave/plugin at master · weaveworks/weave (github.com)](https://github.com/weaveworks/weave/tree/master/plugin)

相关文档是：[Integrating Kubernetes and Mesos via the CNI Plugin (weave.works)]

#### [cni-route-override - a meta CNI plugin that override route information](https://github.com/redhat-nfvpe/cni-route-override)

仓库位置是：[redhat-nfvpe/cni-route-override: CNI plugin to override routes for a container interface (github.com)](https://github.com/redhat-nfvpe/cni-route-override)

相关文档是：同一位置

#### [Terway - a collection of CNI Plugins based on alibaba cloud VPC/ECS network product](https://github.com/AliyunContainerService/terway)

仓库位置是：[AliyunContainerService/terway: CNI plugin for Alibaba Cloud VPC/ENI (github.com)](https://github.com/AliyunContainerService/terway)

相关文档是：同一位置

#### [Cisco ACI CNI - for on-prem and cloud container networking with consistent policy and security model.](https://github.com/noironetworks/aci-containers)

仓库位置是：[noironetworks/aci-containers: Plugins for integrating ACI with container orchestration systems (github.com)](https://github.com/noironetworks/aci-containers)

相关文档是：同一位置

#### [Kube-OVN - a CNI plugin that bases on OVN/OVS and provides advanced features like subnet, static ip, ACL, QoS, etc.](https://github.com/kubeovn/kube-ovn)

仓库位置是：[kubeovn/kube-ovn: A Bridge between SDN and Cloud Native (Project under CNCF) (github.com)](https://github.com/kubeovn/kube-ovn)

相关文档是：[kube-ovn/install.md at master · kubeovn/kube-ovn (github.com)](https://github.com/kubeovn/kube-ovn/blob/master/docs/install.md)

#### [Project Antrea - an Open vSwitch k8s CNI](https://github.com/vmware-tanzu/antrea)

仓库位置是：[antrea-io/antrea: Kubernetes networking based on Open vSwitch (github.com)](https://github.com/antrea-io/antrea)

相关文档是：[antrea/getting-started.md at main · antrea-io/antrea (github.com)](https://github.com/antrea-io/antrea/blob/main/docs/getting-started.md)

#### [OVN4NFV-K8S-Plugin - a OVN based CNI controller plugin to provide cloud native based Service function chaining (SFC), Multiple OVN overlay networking](https://github.com/opnfv/ovn4nfv-k8s-plugin)

仓库位置是：[opnfv/ovn4nfv-k8s-plugin: This repository is archived. Please see https://github.com/akraino-edge-stack/icn-nodus for the latest code.](https://github.com/opnfv/ovn4nfv-k8s-plugin)

相关文档是：同一位置

> 已经关闭

#### [Azure CNI - a CNI plugin that natively extends Azure Virtual Networks to containers](https://github.com/Azure/azure-container-networking)

仓库位置是：[Azure/azure-container-networking: Azure Container Networking Solutions for Linux and Windows Containers (github.com)](https://github.com/Azure/azure-container-networking)

相关文档是：[azure-container-networking/docs at master · Azure/azure-container-networking (github.com)](https://github.com/Azure/azure-container-networking/tree/master/docs)

#### [Hybridnet - a CNI plugin designed for hybrid clouds which provides both overlay and underlay networking for containers in one or more clusters. Overlay and underlay containers can run on the same node and have cluster-wide bidirectional network connectivity.](https://github.com/alibaba/hybridnet)

仓库位置是：[alibaba/hybridnet: A CNI plugin, provides networking environment where overlay and underlay containers can run on the same node and have cluster-wide bidirectional network connectivity. (github.com)](https://github.com/alibaba/hybridnet)

相关文档是：[Home · alibaba/hybridnet Wiki (github.com)](https://github.com/alibaba/hybridnet/wiki)

#### [Spiderpool - An IP Address Management (IPAM) CNI plugin of Kubernetes for managing static ip for underlay network](https://github.com/spidernet-io/spiderpool)

仓库位置是：[spidernet-io/spiderpool: spiderpool: Kubernetes IPAM for underlay network (github.com)](https://github.com/spidernet-io/spiderpool)

相关文档是：[spiderpool/install.md at main · spidernet-io/spiderpool (github.com)](https://github.com/spidernet-io/spiderpool/blob/main/docs/usage/install.md)
