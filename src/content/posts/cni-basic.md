---
title: "Kubernetes 容器网络 —— CNI"
date: "2024-04-11"
category: "tech"
tags: ["OSPP", "CNI", "Linux"]
summary: "CNI 如何用一套标准接口抽象掉底层网络实现的差异:插件结构、网络配置文件格式,以及容器创建/删除时 ADD/DEL 的调用约定。"
reading: "6 min"
---
## CNI 概述

### 什么是 CNI 

> CNI的全称是 Container Network Interface，它为**容器提供了一种基于插件结构的标准化网络解决方案**。以往，容器的网络层是和具体的底层网络环境高度相关的，不同的网络服务提供商有不同的实现。**CNI从网络服务里抽象出了一套标准接口**，从而屏蔽了上层网络和底层网络提供商的网络实现之间的差异。并且，通过插件结构，它让容器在网络层的具体实现变得可插拔了，所以非常灵活。

首先 CNI 是一套标准接口，它隶属于[CNCF(Cloud Native Computing Foundation)](https://cncf.io/)，依照这个标准所实现的为 CNI Plugins, 他们彼此独立，也可以组合起来一起使用，由一组用于配置 Linux 容器的网络接口的规范和库组成，同时还包含了一些插件，CNI 仅关心容器创建时的网络分配，和当容器被删除时释放网络资源。

其次 依据 CNI 的[规范](https://github.com/containernetworking/cni/blob/master/SPEC.md)，CNI 具有以下几点特征：

- CNI 需提供网络管理员**定义网络配置的文件格式**
- CNI 需提供 Container Runtime（CRI） 调用功能的**协议/API**。
- 当 CNI 被 CRI 调用时，需依据配置文件执行网络配置功能
- CNI 需预留可调用其他插件的能力
- CNI 需规范统一返回给CRI 的数据格式

依据这样的特征和要求，可以明确实现一个CNI插件需要包含以下部分：

* 可执行文件
  * CNI 主进程
  * IPAM 等
* 网络配置文件

---

### CNI 的功能

CNI 插件首先得实现一个可以被容器管理系统（CRI），比如rkt、Kubernetes 所调用的可执行文件——cni plugins，这个插件首先需要提供**基础的 Linux 网络联通服务**，比如创建 veth 或者 bridge 并将 veth 对的一端插入容器的 network namespace，一端插入 bridge，使得容器之间可以相互通信。然后**将IP 分配给接口**，并通过调用 **IPAM** 插件来设置和管理IP地址，使得集群内的容器IP地址相互不重复，或者是结合其他的插件来实现更加复杂的网络路由管理功能等等。

那么接下来，依据对于这几项功能的要求，来具体看看 CNI 的标准

---

### CNI 统一的网络配置文件

CNI 为容器网络管理员(操作人员、网络插件、网络编排系统)定义了一种网络配置格式。它包含了供 CRI 和 CNI 插件使用的指令。在插件执行时，这种配置格式由 CRI 解释，并转化为代码数据结构，传递给 CNI 插件。

一般来说配置文件主要是以 JSON 文件为主，且包含以下几个键值：

- `cniVersion`: 指定CNI规范的版本，这样 CRI 和 CNI 才能读懂彼此
- `Name`: 网络名字，这在一个主机（或其他管理域）的所有网络配置中应该是唯一的。必须以一个字母数字字符开始，后面可以选择由一个或多个字母数字字符、下划线、点（.）或连字符（-）的任何组合。
- `disableCheck`: 是否禁用检查网络，如果为true,则 `container runtime` 不会调用 Check 方法进行网络检查。
- `plugin`: cni插件及其配置列表，可以配置多个插件。

接着展开说明一下 plugin 当中的参数，这也与实现 CNI 的功能息息相关，CRI 解析出配置文件当中的这个字段，是必须要一个字不漏地完整交给 CNI 插件来做网络管理

1. 必须配置的键值

   `type` :  指定目前系统目录当中所使用的 CNI 插件，一般是 cni 可执行文件的目录索引

   至少得有一个基础的 cni 插件来完成最基础的 Linux 网络配置的功能

2. 可选键值，由 CRI 依据协议发送的 request 指定

   `capabilities`:  如果 CNI_ARGS 中没有指定此项功能时候来补充的

3. 预留键值，由 CRI 在执行时产生的

   - `runtimeConfig` :  比如 CNI 自己设置的 isGateway == true 就表明告诉插件，作为网关，给bridge指定一个IP地址。这样，连接到bridge的容器就可以拿它当网关来用了。
   - `args`
   - 或者是任何以 `cni.dev/`开头的

4. 可选键值,由容器网络管理员添加

   `ipMasq`: 为目标网络配上Outbound Masquerade(地址伪装)，即：由容器内部通过网关向外发送数据包时，对数据包的源IP地址进行修改。

   当我们的容器以宿主机作为网关时，这个参数是必须要设置的。否则，从容器内部发出的数据包就没有办法通过网关路由到其他网段。因为容器内部的IP地址无法被目标网段识别，所以这些数据包最终会被丢弃掉。

   `ipam`: PAM(IP Adderss Management)即IP地址管理，提供了一系列方法用于对IP和路由进行管理。实际上，它对应的是由CNI提供的一组标准IPAM插件，比如像host-local，dhcp，static等。如果要对整个集群的地址做管理，让pod具有单独的ip地址，就需要在这里添加额外的插件

   > 例子1当中：
   >
   > - type：指定所用IPAM插件的名称，在例子里，用的是host-local。
   > - subnet：为目标网络分配网段，包括网络ID和子网掩码，以CIDR形式标记。在例子里为`10.15.10.0/24`，也就是目标网段为`10.15.10.0`，子网掩码为`255.255.255.0`。
   > - routes：用于指定路由规则，插件会在容器的路由表里生成相应的规则。其中，dst表示希望到达的目标网段，以CIDR形式标记。gw对应网关的IP地址，也就是要到达目标网段所要经过的“next hop(下一跳)”。如果省略gw的话，那么插件会自动帮容器选择默认网关。在例子里，gw选择的是默认网关，而dst为`0.0.0.0/0`则代表“任何网络”，表示数据包将通过默认网关发往任何网络。实际上，这对应的是一条默认路由规则，即：当所有其他路由规则都不匹配时，将选择该路由。
   > - rangeStart：允许分配的IP地址范围的起始值
   > - rangeEnd：允许分配的IP地址范围的结束值
   > - gateway：为网关（也就是将要在宿主机上创建的bridge）指定的IP地址。如果省略的话，那么插件会自动从允许分配的IP地址范围内选择起始值作为网关的IP地址。

配置文件例子如下：

例子1：

```json
{
    "cniVersion": "0.4.0",
    "name": "lab-br0",
    "type": "bridge",
    "bridge": "lab-br0",
    "isGateway": true,
    "ipMasq": true,
    "ipam": {
        "type": "host-local",
        "subnet": "10.15.10.0/24",
        "routes": [
            { "dst": "0.0.0.0/0" }
        ],
        "rangeStart": "10.15.10.100",
        "rangeEnd": "10.15.10.200",
        "gateway": "10.15.10.99"
    }
}
```

例子2：

```json
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "plugins": [
    {
      "type": "bridge",
      // plugin specific parameters
      "bridge": "cni0",
      "keyA": ["some more", "plugin specific", "configuration"],
      
      "ipam": {
        "type": "host-local",
        // ipam specific
        "subnet": "10.1.0.0/16",
        "gateway": "10.1.0.1",
        "routes": [
            {"dst": "0.0.0.0/0"}
        ]
      },
      "dns": {
        "nameservers": [ "10.1.0.1" ]
      }
    },
    {
      "type": "tuning",
      "capabilities": {
        "mac": true
      },
      "sysctl": {
        "net.core.somaxconn": "500"
      }
    },
    {
        "type": "portmap",
        "capabilities": {"portMappings": true}
    }
  ]
}
```

---

### CNI 运行时协议

CNI协议是基于由 CRI 的调用请求来告诉 CNI 该做些什么。

主要的协议参数定义如下：

* CNI_COMMAND：表示所需的操作；ADD、DEL、CHECK、或VERSION。
* CNI_CONTAINERID：容器ID。告诉CNI插件，将要加入目标网络的容器所对应的network namespace的ID,容器的唯一的标识符，由 CRI 分配。不能是空的。必须以一个字母数字字符开始，后面可以选择一个或多个字母数字字符、下划线（）、点（.）或连字符（-）的任何组合。
* CNI_NETNS：容器对应的network namespace在宿主机上的文件路径。（例如：/run/netns/[nsname]）。
* CNI_IFNAME：作为veth pair在容器一端的网络接口,一般是在容器内创建的接口的名称；如果 CNI 插件无法使用这个接口名称，那么就必须返回一个错误。
* CNI_ARGS：用户在调用时传入的额外参数。用分号分隔的字母数字键值对；例如，"FOO=BAR;ABC=123"
* CNI_PATH: 表示 CNI 插件可执行文件的路径列表。路径由操作系统特定的列表分隔符分隔；例如Linux上的':'和Windows上的'；'。

告诉CNI插件要执行的命令，允许的命令有ADD，DEL，CHECK，VERSION。

对于支持CNI规范的容器系统而言，当容器启动的时候，系统就会自动调用相应的CNI插件，并设置CNI_COMMAND为ADD。相应地，DEL是在容器被销毁时调用的，用于清除在执行ADD阶段分配的网络资源。CHECK用于检查容器网络是否正常。VERSION则用来显示插件的版本。具体的操作如下：

* ADD

  - 将容器添加到网络中，或将新的配置修改应用到已有的集群当中。

  - 一个CNI插件在收到ADD命令后，应该选择

    - 在 CNI_NETNS 的容器内创建由 CNI_IFNAME 定义的接口，

    - 调整容器内 CNI_NETNS 处由CNI_IFNAME定义的接口的配置

      如果CNI插件成功，必须要返回一个处理结果，要么打印出来，要么修改传入的参数。

* DELETE

  * 将容器删除出网络，或将新的配置修改应用到已有的集群当中。

    功能与ADD 相对

* CHECK

  * 查找类型字段中指定的可执行文件，如果没找到返回错误
  * 当 Plugins （CNI调用的其他的Plugins）返回错误时，将其返回给调用者

---

### CNI 与插件

为了解决容器网络的各项需求和问题，将所有的功能单独集中在 CNI 单个程序中是不现实的，而且难以兼容不同的上层系统和底层的网络管理，于是一个显然的想法就是将这些功能独立出来，使用插件（Plugins）的形式来执行。

一个常见的例子就是 IP 地址管理，这就是IP地址管理插件（IPAM插件），它必须设置容器和虚拟网络设备的接口 ，IP / 子网，网关和路由，然后将此信息返回给“主”插件（CNI本体）来执行，换句话说 IPAM 做逻辑上的网络地址管理然后告诉本体 CNI 去执行 `ADD`,`DELETE`。 

CNI 本体调用这些插件的形式也是通过路径找到这些插件的可执行文件来实现的，一般这些插件的位置也都一起放置在 `CNI_PATH`之下。同时插件和 CNI 本体都是通过 stdin 接收网络配置，也通过 stdout 输出结果。

如此看来 CNI 的工作流程就是一条链状的调用过程，但调用链中的每一个可执行程序所接收的配置文件信息都是完整的。

---

## CNI 配置文件样例

> 参考[cni/SPEC.md at spec-v1.0.0 · containernetworking/cni (github.com)](https://github.com/containernetworking/cni/blob/spec-v1.0.0/SPEC.md) 的 Appendix: Examples

借助 Github 所给的 SPEC 例子，假设目前 CRI 接收到的 json 文件如下，

```json
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "plugins": [
    {
      "type": "bridge",
      // plugin specific parameters
      "bridge": "cni0",
      "keyA": ["some more", "plugin specific", "configuration"],
      
      "ipam": {
        "type": "host-local",
        // ipam specific
        "subnet": "10.1.0.0/16",
        "gateway": "10.1.0.1",
        "routes": [
            {"dst": "0.0.0.0/0"}
        ]
      },
      "dns": {
        "nameservers": [ "10.1.0.1" ]
      }
    },
    {
      "type": "tuning",
      "capabilities": {
        "mac": true
      },
      "sysctl": {
        "net.core.somaxconn": "500"
      }
    },
    {
        "type": "portmap",
        "capabilities": {"portMappings": true}
    }
  ]
}
```

#### Add example

The container runtime would perform the following steps for the `add` operation.

1. Call the `bridge` plugin with the following JSON, `CNI_COMMAND=ADD`:

```
{
    "cniVersion": "1.0.0",
    "name": "dbnet",
    "type": "bridge",
    "bridge": "cni0",
    "keyA": ["some more", "plugin specific", "configuration"],
    "ipam": {
        "type": "host-local",
        "subnet": "10.1.0.0/16",
        "gateway": "10.1.0.1"
    },
    "dns": {
        "nameservers": [ "10.1.0.1" ]
    }
}
```

The bridge plugin, as it delegates IPAM to the `host-local` plugin, would execute the `host-local` binary with the exact same input, `CNI_COMMAND=ADD`.

The `host-local` plugin returns the following result:

```
{
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1"
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
}
```

The bridge plugin returns the following result, configuring the interface according to the delegated IPAM configuration:

```
{
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "99:88:77:66:55:44",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
}
```

1. Next, call the `tuning` plugin, with `CNI_COMMAND=ADD`. Note that `prevResult` is supplied, along with the `mac` capability argument. The request configuration passed is:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "tuning",
  "sysctl": {
    "net.core.somaxconn": "500"
  },
  "runtimeConfig": {
    "mac": "00:11:22:33:44:66"
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "99:88:77:66:55:44",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

The plugin returns the following result. Note that the **mac** has changed.

```
{
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
}
```

1. Finally, call the `portmap` plugin, with `CNI_COMMAND=ADD`. Note that `prevResult` matches that returned by `tuning`:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "portmap",
  "runtimeConfig": {
    "portMappings" : [
      { "hostPort": 8080, "containerPort": 80, "protocol": "tcp" }
    ]
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

The `portmap` plugin outputs the exact same result as that returned by `bridge`, as the plugin has not modified anything that would change the result (i.e. it only created iptables rules).

#### Check example

Given the previous *Add*, the container runtime would perform the following steps for the *Check* action:

1. First call the `bridge` plugin with the following request configuration, including the `prevResult` field containing the final JSON response from the *Add* operation, **including the changed mac**. `CNI_COMMAND=CHECK`

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "bridge",
  "bridge": "cni0",
  "keyA": ["some more", "plugin specific", "configuration"],
  "ipam": {
    "type": "host-local",
    "subnet": "10.1.0.0/16",
    "gateway": "10.1.0.1"
  },
  "dns": {
    "nameservers": [ "10.1.0.1" ]
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

The `bridge` plugin, as it delegates IPAM, calls `host-local`, `CNI_COMMAND=CHECK`. It returns no error.

Assuming the `bridge` plugin is satisfied, it produces no output on standard out and exits with a 0 return code.

1. Next call the `tuning` plugin with the following request configuration:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "tuning",
  "sysctl": {
    "net.core.somaxconn": "500"
  },
  "runtimeConfig": {
    "mac": "00:11:22:33:44:66"
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

Likewise, the `tuning` plugin exits indicating success.

1. Finally, call `portmap` with the following request configuration:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "portmap",
  "runtimeConfig": {
    "portMappings" : [
      { "hostPort": 8080, "containerPort": 80, "protocol": "tcp" }
    ]
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

#### Delete example

Given the same network configuration JSON list, the container runtime would perform the following steps for the *Delete* action. Note that plugins are executed in reverse order from the *Add* and *Check* actions.

1. First, call `portmap` with the following request configuration, `CNI_COMMAND=DEL`:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "portmap",
  "runtimeConfig": {
    "portMappings" : [
      { "hostPort": 8080, "containerPort": 80, "protocol": "tcp" }
    ]
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

1. Next, call the `tuning` plugin with the following request configuration, `CNI_COMMAND=DEL`:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "tuning",
  "sysctl": {
    "net.core.somaxconn": "500"
  },
  "runtimeConfig": {
    "mac": "00:11:22:33:44:66"
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

1. Finally, call `bridge`:

```
{
  "cniVersion": "1.0.0",
  "name": "dbnet",
  "type": "bridge",
  "bridge": "cni0",
  "keyA": ["some more", "plugin specific", "configuration"],
  "ipam": {
    "type": "host-local",
    "subnet": "10.1.0.0/16",
    "gateway": "10.1.0.1"
  },
  "dns": {
    "nameservers": [ "10.1.0.1" ]
  },
  "prevResult": {
    "ips": [
        {
          "address": "10.1.0.5/16",
          "gateway": "10.1.0.1",
          "interface": 2
        }
    ],
    "routes": [
      {
        "dst": "0.0.0.0/0"
      }
    ],
    "interfaces": [
        {
            "name": "cni0",
            "mac": "00:11:22:33:44:55"
        },
        {
            "name": "veth3243",
            "mac": "55:44:33:22:11:11"
        },
        {
            "name": "eth0",
            "mac": "00:11:22:33:44:66",
            "sandbox": "/var/run/netns/blue"
        }
    ],
    "dns": {
      "nameservers": [ "10.1.0.1" ]
    }
  }
}
```

The bridge plugin executes the `host-local` delegated plugin with `CNI_COMMAND=DEL` before returning.

---

### 相关仓库及文献

[cni/SPEC.md at spec-v1.0.0 · containernetworking/cni (github.com)](https://github.com/containernetworking/cni/blob/spec-v1.0.0/SPEC.md)

[Kubernetes网络之CNI规范解读 | LRF (lengrongfu.github.io)](https://lengrongfu.github.io/2022-05-11-k8s之CNI规范解读/)

[A brief overview of the Container Network Interface (CNI) in Kubernetes | Enable Sysadmin (redhat.com)](https://www.redhat.com/sysadmin/cni-kubernetes)

[Bring your own Container Network Interface (CNI) plugin - Azure Kubernetes Service | Microsoft Learn](https://learn.microsoft.com/en-us/azure/aks/use-byo-cni?tabs=azure-cli)

[Network Plugins | Kubernetes](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)

[Kubernetes CNI Explained (tigera.io)](https://www.tigera.io/learn/guides/kubernetes-networking/kubernetes-cni/)
