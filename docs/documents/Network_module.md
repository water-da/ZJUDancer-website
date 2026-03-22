# Network moduledtransmit

Socket（注意S⼤写）现在机器⼈上这个类叫Foo

封装过的UDP socket，它的成员除了socket本⾝之外还包含回调函数readHandler、接收缓冲区 recvBuffer、数据来源remoteEndpoint（ip和端⼝号）。

通过std::map，端⼝号可以对应到⼀个Socket，进⽽也可以对应到Socket的成员。

Socket(boost::asio::io_service &service, PORT port)

Socket的构造函数，传⼊io_service和port。socket的异步接收由service统⼀管理，socket绑定到本机端⼝port上。

## Dtransmit

接收数据包：

void startRecv(PORT port, ReadHandler handler)

PORT就是int，ReadHandler是模板占位符，不⽤管

传⼊⼀个本机端⼝号和对应的readHandler，⽤这个端⼝号对应的socket开始接收数据包，把数据来源ip和端⼝号保存在Socket.remoteEndpoint中，并把数据交给readHandler处理。

这是异步操作，不阻塞主线程。

void addRawRecv(PORT port, std::function&lt;void(void \*, std::size_t)&gt; callback)

传⼊⼀个本机端⼝号和回调函数callback，⽤端⼝号新建⼀个Socket，定义其readHandler功能为：只要从socket正常获取数据包，就把它交给回调函数callback。

随后调⽤startRecv，开始接收并处理数据包。

void addRawRecvFiltered(PORT port, std::string remoteEndpoint, std::function&lt;void(void \*, std::size_t)&gt; callback)

传⼊⼀个本机端⼝号，数据包来源remoteEndpoint和回调函数callback，⽤端⼝号新建⼀个Socket，定义其readHandler功能为：只要从socket正常获取来⾃remoteEndpoint的数据包，就把它交给回调函数callback，过滤掉所有其他来源的数据包。

随后调⽤startRecv，开始接收并处理数据包。

void addRosRecv(PORT port, std::function&lt;void(ROSMSG &)&gt; callback)

传⼊⼀个本机端⼝号和回调函数callback，⽤端⼝号新建⼀个Socket，定义其readHandler功能为：把从socket获取的数据包翻译成ROS message（但是好像不翻译也能⽤？），交给回调函数callback。

随后调⽤startRecv，开始接收并处理数据包。

发送数据包：

void createSendSocket(const std::string &addr, const PORT &port)

传⼊⽬标主机的ip地址addr和端⼝号port，封装成⼀个broadcastEndpoint对象。新建⼀个socket。通过std::map，⼀个(addr, port)可以唯⼀对应到⼀个socket。令这个socket与broadcastEndpoint建

⽴连接。

void DTransmit::sendBuffer(boost::asio::ip::udp::socket \*socket, const void

\*buffer, std::size_t size)

传⼊createSendSocket创建的socket，数据缓冲区地址，数据包⼤⼩，⽤这个socket把数据包发过去。

void sendRaw(PORT port, const void \*buffer, std::size_t size)

传⼊端⼝号，数据缓冲区地址，数据包⼤⼩。调⽤broadcast_addresses_获取数据要发到的所有ip地址，调⽤createSendSocket创建每个地址对应的socket（端⼝号都是传⼊的port），调⽤sendBuffer把数据包发到这些地址。

void DTransmit::sendRos(PORT port, ROSMSG &rosmsg)

传⼊⽬标主机端⼝号和rosmsg，将rosmsg序列化（变为可以⽤socket发出的格式，但是好像不变也能发？），放⼊buffer中，调⽤sendRaw发出去。

# dprocess

Network module 的“进程”类，Team和GameController的⽗类，负责新建⼀个线程，线程中循环调⽤Team和GameController的发包函数。

循环频率、是否采⽤SCHED_FIFO的线程调度策略均可修改。

# dnetwork

所有机器⼈⽤于队内通信的端⼝号均为57335，定义在 workspaces\\core\\src\\dconfig\\include\\dconfig\\dconstant.hpp

所有机器⼈⽤于和裁判盒通信的端⼝号均为3838，裁判盒⽤于和机器⼈通信的端⼝号为3939，定义在

workspaces\\core\\src\\dnetwork\\include\\dnetwork\\RoboCup\\RoboCupGameControlData.h

## Team

本机内ROS通信

订阅vision，motion，behavior，gamecontroller，向/dbehavior_n/BehaviorInfo（n为本机编号）发布消息。

收消息

调⽤DTransmit的addRawRecv⽅法，回调函数为：先根据条件筛选：

1）数据包的⼤⼩与TeamInfo⼀致 2）是本队的消息

3）不是⾃⼰发出的消息

如果都满⾜，则向/dbehavior_n/TeamInfo发布。

发消息

通过tick()⽅法实现。

从vision，motion，behavior，gamecontroller获取信息后更新在info_中，调⽤DTransmit的 sendRaw⽅法把info_发给局域⽹内所有主机的57335端⼝。

## GameController

本机内ROS通信

没有订阅。

通过tick()⽅法（和Team中的tick不同），向/dbehavior_n/GCInfo（n为本机编号）发布消息，消息内容为info_。

收消息

调⽤DTransmit的addRawRecvFiltered⽅法，回调函数为：筛选掉不来⾃裁判盒的数据包和⼤⼩不符合RoboCupGameControlData数据类型的数据包，正常的数据包交给ParseData⽅法处理。

通过ParseData和其他⽅法，逐步筛选出发给本队（有没有精确到本机？）的数据包，如果相⽐之前⼀个有更新，则更新在info_中。

发消息

调⽤DTransmit的sendRaw⽅法，把ret_消息（包含队伍编号、机器⼈编号、表明⾃⼰在线的标记）发给发给局域⽹内所有主机的3939端⼝（但只有裁判盒会处理）。