
---

# Network module

## dtransmit

### Socket (注意 S 大写) 现在机器人上这个类叫 Foo
封装过的 UDP socket，它的成员除了 socket 本身之外还包含回调函数 readHandler、接收缓冲区 recvBuffer、数据来源 remoteEndpoint (ip和端口号)。

通过 std::map，端口号可以对应到一个 Socket，进而也可以对应到 Socket 的成员。

### Socket(boost::asio::io_service &service, PORT port)
Socket 的构造函数，传入 io_service 和 port。socket 的异步接收由 service 统一管理，socket绑定到本机端口 port 上。

## Dtransmit

### 接收数据包：

**void startRecv(PORT port, ReadHandler handler)**
PORT 就是 int，ReadHandler 是模板占位符，不用管

传入一个本机端口号和对应的 readHandler，用这个端口号对应的 socket 开始接收数据包，把数据来源 ip 和端口号保存在 Socket.remoteEndpoint 中，并把数据交给 readHandler 处理。

这是异步操作，不阻塞主线程。

**void addRawRecv(PORT port, std::function<void(void *, std::size_t)> callback)**
传入一个本机端口号和回调函数 callback，用端口号新建一个 Socket，定义其 readHandler 功能为：只要从 socket 正常获取数据包，就把它交给回调函数 callback。

随后调用 startRecv，开始接收并处理数据包。

**void addRawRecvFiltered(PORT port, std::string remoteEndpoint, std::function<void(void *, std::size_t)> callback)**
传入一个本机端口号、数据包来源 remoteEndpoint 和回调函数 callback，用端口号新建一个 Socket，定义其 readHandler 功能为：只要从 socket 正常获取来自 remoteEndpoint 的数据包，就把它交给回调函数 callback，过滤掉所有其他来源的数据包。

随后调用 startRecv，开始接收并处理数据包。

**void addRosRecv(PORT port, std::function<void(ROSMSG &)> callback)**
传入一个本机端口号和回调函数 callback，用端口号新建一个 Socket，定义其 readHandler 功能为：把从 socket 获取的数据包翻译成 ROS message（但是好像不翻译也能用？），交给回调函数 callback。

随后调用 startRecv，开始接收并处理数据包。

### 发送数据包：

**void createSendSocket(const std::string &addr, const PORT &port)**
传入目标主机的 ip 地址 addr 和端口号 port，封装成一个 broadcastEndpoint 对象。新建一个 socket，通过 std::map，一个(addr, port)可以唯一对应到一个 socket，令这个 socket 与 broadcastEndpoint 建立连接。

**void DTransmit::sendBuffer(boost::asio::ip::udp::socket *socket, const void *buffer, std::size_t size)**
传入 createSendSocket 创建的 socket，数据缓冲区地址，数据包大小，用这个 socket 把数据包发过去。

**void sendRaw(PORT port, const void *buffer, std::size_t size)**
传入端口号，数据缓冲区地址，数据包大小。调用 broadcast_addresses_ 获取数据要发到的所有 ip 地址，调用 createSendSocket 创建每个地址对应的 socket（端口号都是传入的 port），调用 sendBuffer 把数据包发到这些地址。

**void DTransmit::sendRos(PORT port, ROSMSG &rosmsg)**
传入目标主机端口号和 rosmsg，将 rosmsg 序列化（变为可以用 socket 发出的格式，但是好像不变也能发？），放入 buffer 中，调用 sendRaw 发出去。

---

## dprocess
Network module 的“进程”类，Team 和 GameController 的父类，负责新建一个线程，线程中循环调用 Team 和 GameController 的发包函数。

循环频率、是否采用 SCHED_FIFO 的线程调度策略均可修改。

---

## dnetwork
所有机器人用于队内通信的端口号均为 57335，定义在
workspaces\core\src\dconfig\include\dconfig\dconstant.hpp

所有机器人用于和裁判盒通信的端口号均为 3838，裁判盒用于和机器人通信的端口号为 3939，定义在
workspaces\core\src\dnetwork\include\dnetwork\RoboCup\RoboCupGameControlData.h

---

## Team

### 本机内 ROS 通信
订阅 vision, motion, behavior, gamecontroller，向 /dbehavior_n/BehaviorInfo (n 为本机编号) 发布消息。

### 收消息
调用 DTransmit 的 addRawRecv 方法，回调函数为：

先根据条件筛选：
1) 数据包的大小与 TeamInfo 一致
2) 是本队的消息
3) 不是自己发出的消息

如果都满足，则向 /dbehavior_n/TeamInfo 发布。

### 发消息
通过 tick() 方法实现。

从 vision, motion, behavior, gamecontroller 获取信息后更新在 info_ 中，调用 DTransmit 的 sendRaw 方法把 info_ 发给局域网内所有主机的 57335 端口。

---

## GameController

### 本机内 ROS 通信
没有订阅。

通过 tick() 方法（和 Team 中的 tick 不同），向 /dbehavior_n/GCInfo (n 为本机编号) 发布消息，消息内容为 info_。

### 收消息
调用 DTransmit 的 addRawRecvFiltered 方法，回调函数为：筛选掉不来自裁判盒的数据包和大小不符合 RoboCupGameControlData 数据类型的数据包，正常的数据包交给 ParseData 方法处理。

通过 ParseData 和其他方法，逐步筛选出发给本队（有没有精确到本机？）的数据包，如果相比之前一个有更新，则更新在 info_ 中。

### 发消息
调用 DTransmit 的 sendRaw 方法，把 ret_ 消息（包含队伍编号、机器人编号，表明白己在线的标记）发给发给局域网内所有主机的 3939 端口（但只有裁判盒会处理）。