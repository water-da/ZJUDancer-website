# Behavior 模块代码阅读笔记

本文从 `main.py` 入口开始，梳理 behavior 策略代码的执行链路，重点分析：

- 黑板与角色类的创建
- `BehaviorTree.step()` 的执行过程
- `root_task` 的来源
- `DynamicGuardSelector` 的作用
- `Strike` / `Attack` / `GoKick` 等核心逻辑
- `StrikerBrain` 如何生成攻击目标

---

## 1. 入口：`main.py`

代码入口如下：

```python
bb = DBlackboard()
cls = find_behavior(bb.param.role)  # cls = Striker
behavior = cls(bb)
```

这里要特别注意：

- `bb = DBlackboard()`
  - 创建黑板对象，用于存储共享状态、参数、感知信息和动作输出。

- `cls = find_behavior(bb.param.role)`
  - 根据角色名找到对应的行为类。
  - 如果 `bb.param.role == "Striker"`，那么这里返回的是 `Striker` 这个类。

- `behavior = cls(bb)`
  - 这里才是真正创建对象实例。
  - 所以 `behavior` 是 `Striker(bb)` 这个实例，而不是类本身。

---

## 2. `find_behavior()`：返回的是类，不是对象

```python
def find_behavior(name):
    try:
        cls = getattr(role, name)  # 从 role 模块中获取名为 "Striker" 的类
        return cls
    except AttributeError:
        return None
```

如果：

```python
name = "Striker"
```

则相当于：

```python
cls = role.Striker
```

这里返回的是：

- `Striker` 类本身

不是：

- `Striker()` 对象

因此后面：

```python
behavior = cls(bb)
```

才是在实例化，创建 `Striker(bb)` 这个对象。

---

## 3. `Striker` 的构造逻辑

`Striker` 的核心结构如下：

```python
class Striker(Role):
    """A striker is actively pursuing the ball."""

    def init(self, bb):
        super(Striker, self).init(bb)
        root = DynamicGuardSelector([
            (Parallel(PrepareIMU(bb), InitialParticles(bb)), LowerBoardReconnected()),
            (Sequence(Wait(1), EntryScanField(bb)), IMUInitialized()),
            # (Parallel(GoToInitPos(bb), FindBall(bb)), BallSeen()),
            # (ScanFieldNew(bb), MotionReStable()),
            (Strike(bb), None)
        ])
        self.add_child(root)
```

这里可以先得到一个结论：

- `behavior` 是 `Striker` 的实例
- `Striker` 继承自 `Role`
- `Role` 继承自 `BehaviorTree`

因此后面调用：

```python
behavior.step()
```

实际执行的是 `BehaviorTree` 里的 `step()` 方法。

---

## 4. 主循环执行流程

主循环中有：

```python
bb.reset()
behavior.step()
bb.publish()
```

含义是：

1. `bb.reset()`
   - 重置当前周期的一些临时黑板状态

2. `behavior.step()`
   - 运行一帧行为树

3. `bb.publish()`
   - 将本周期生成的动作命令发出去

这个结构就是典型的行为树周期执行框架。

---

## 5. `BehaviorTree.step()` 的逻辑

`step()` 没有被 `Striker` 重写，定义在 `BehaviorTree` 中：

```python
def step(self):
    # 判断1: 根任务是否正在运行？
    if self.root_task.get_status() == Status.RUNNING:
        # 情况A: 正在运行 → 继续执行
        self.root_task.run()
    else:
        # 情况B: 未运行 → 启动任务
        self.root_task.set_control(self)
        self.root_task.on_start()

        # 判断2: 守卫条件是否通过？
        if self.root_task.check_guard():
            self.root_task.run()
        else:
            self.root_task.failure()
```

---

## 6. `root_task` 从哪里来

这个问题很关键，因为 `Striker` 自己并没有显式定义 `root_task`，但有：

```python
self.add_child(root)
```

来看 `add_child()`：

```python
def add_child(self, child):
    if self.root_task is not None:
        raise RuntimeError('A behavior tree cannot have more than one root task')
    child.set_control(self)
    self.root_task = child
    return 0
```

因此这里的逻辑是：

```python
root = DynamicGuardSelector([...])
self.add_child(root)
```

最终变成：

```python
self.root_task = root
```

所以：

- `root_task` 就是 `DynamicGuardSelector` 的实例
- 它是整棵行为树的根节点

---

## 7. `DynamicGuardSelector` 是什么

`DynamicGuardSelector`，简称 DGS，是一个 **branch 节点**。

继承关系如下：

- `DynamicGuardSelector`
  - 继承自 `Branch`
- `Branch`
  - 继承自 `Task`

所以它本质上也是一个任务节点，只是它负责选择和调度子节点。

### 核心作用

DGS 会：

- 遍历自己的子节点
- 找到第一个 guard 为 `True` 的子任务
- 执行该子任务
- 成功后进行重置

例如：

```python
[
    (Parallel(PrepareIMU(bb), InitialParticles(bb)), LowerBoardReconnected()),
    (Sequence(Wait(1), EntryScanField(bb)), IMUInitialized()),
    (Strike(bb), None)
]
```

这里每个元素都是：

```python
(行为, 触发条件)
```

含义是：

- 如果 `LowerBoardReconnected()` 为真，就执行 `Parallel(PrepareIMU(bb), InitialParticles(bb))`
- 否则如果 `IMUInitialized()` 为真，就执行 `Sequence(Wait(1), EntryScanField(bb))`
- 否则执行 `Strike(bb)`

其中：

```python
None
```

可以理解为默认总是成立，相当于兜底分支。

---

## 8. `Task` 状态枚举：`Status`

`self.root_task.get_status()` 实际调用的是 `Task` 中的方法，直接返回：

```python
self._status
```

状态定义如下：

```python
class Status(Enum):
    """The enumeration of the values that a task's status can have."""
    FRESH = 0
    RUNNING = 1
    FAILED = 2
    SUCCEEDED = 3
    CANCELLED = 4
```

含义如下：

- `FRESH`
  - 从未运行，或已经被 reset

- `RUNNING`
  - 正在执行，需要下一帧继续跑

- `FAILED`
  - 执行失败

- `SUCCEEDED`
  - 执行成功

- `CANCELLED`
  - 被祖先节点中止

---

## 9. `set_control()` 与树引用传递

在 `step()` 中有：

```python
self.root_task.set_control(self)
```

对应方法：

```python
def set_control(self, control):
    """This method will set a task as this task's control (parent)."""
    self._control = control
    self._tree = control.get_tree()
```

这里调用时：

- 外层 `self` 是 `BehaviorTree` / `Striker`
- `control` 被设置为当前树控制者
- `root_task._control = BehaviorTree实例`

而 `get_tree()` 的逻辑是：

```python
def get_tree(self):
    """Returns the behavior tree this task belongs to."""
    if self._tree is None and \
       self._control is not None and \
       self._control.get_tree() is not None:
        self._tree = self._control.get_tree()
    return self._tree
```

简单理解：

- 每个任务节点都能沿着 `_control` 找到自己所在的行为树
- 这样 guard、任务执行、状态机都能共享整棵树的上下文

---

## 10. `check_guard()` 的逻辑

`step()` 里还有：

```python
self.root_task.check_guard()
```

`Task.check_guard()` 定义如下：

```python
class Task(object):
    def check_guard(self):
        # 判断: 是否有守卫？
        if self._guard is None:
            return True

        # 递归检查守卫的守卫
        if not self._guard.check_guard():
            return False

        # 执行守卫任务
        self._guard.set_control(self._control.get_tree().guard_evaluator)
        self._guard.on_start()
        self._guard.run()

        # 判断守卫结果
        if self._guard.get_status() == Status.SUCCEEDED:
            return True
        elif self._guard.get_status() == Status.FAILED:
            return False
```

也就是说：

1. 如果没有 guard，直接通过
2. 如果 guard 自己还有 guard，就递归检查
3. guard 自己也作为一个任务运行
4. guard 成功则返回 `True`
5. guard 失败则返回 `False`

所以 guard 不是一个简单布尔表达式，而是一个可以独立运行的条件任务。

---

## 11. `DynamicGuardSelector.run()` 的执行方式

`self.root_task.run()` 在 DGS 中被重写，大致如下：

```python
def run(self):
    # 步骤1: 初始化要运行的子节点索引
    self._child_to_run = None

    # 步骤2: 遍历所有子节点，找第一个守卫通过的
    for idx, child in enumerate(self._children):
        if child.check_guard():
            self._child_to_run = idx
            self.append_buffer(self._child_to_run)
            break

    # 步骤3: 优先级抢占检查（第一次运行时跳过）
    if self.check_buffer() and self._running_child is not None:
        # ... 优先级切换逻辑
        pass

    # 步骤4: 判断是否找到可运行的子节点
    if self._child_to_run is None:
        self.failure()
    else:
        # 步骤5: 判断是否首次运行
        if self._running_child is None:
            self._running_child = self._child_to_run
            running_child = self.get_child(self._running_child)
            running_child.set_control(self)
            running_child.on_start()
        else:
            running_child = self.get_child(self._running_child)

        # 步骤6: 执行选中的子节点
        running_child.run()
```

### 这段逻辑说明了什么

DGS 每次运行时会：

1. 找到第一个 guard 成立的子节点
2. 如果没有找到，直接失败
3. 如果找到了：
   - 第一次执行就初始化该子节点
   - 否则继续执行当前运行的子节点
4. 最终调用该子节点的 `run()`

---

## 12. 回到 `Striker`：它真正长期执行的是 `Strike(bb)`

从 `Striker` 根节点配置可以看到：

```python
root = DynamicGuardSelector([
    (Parallel(PrepareIMU(bb), InitialParticles(bb)), LowerBoardReconnected()),
    (Sequence(Wait(1), EntryScanField(bb)), IMUInitialized()),
    (Strike(bb), None)
])
```

这意味着：

- 机器人重连下板时，会优先执行初始化逻辑
- IMU 初始化阶段，会执行扫描逻辑
- 正常情况下，最终都会落到：

```python
(Strike(bb), None)
```

所以从长期运行的角度看，`Striker` 的核心逻辑基本就是 `Strike(bb)`。

---

## 13. `Strike` 的结构

`Strike` 定义如下：

```python
class Strike(Parallel):
    def init(self, bb):
        args = (
            StrikerBrain(bb),
            DynamicGuardSelector([
                (Attack(bb), GuardSelector(BallSeen(), TeamBallSeen(), Kicking())),
                (SeekBall(bb), None),
            ])
        )
        super(Strike, self).init(*args)
```

可以看出：

- `Strike` 继承自 `Parallel`
- 它有两个并行子树：

### 左子树
```python
StrikerBrain(bb)
```

### 右子树
```python
DynamicGuardSelector([
    (Attack(bb), GuardSelector(BallSeen(), TeamBallSeen(), Kicking())),
    (SeekBall(bb), None),
])
```

也就是说：

- 左边负责“算目标”
- 右边负责“执行动作”

这是一个比较典型的“计算与执行解耦”的结构。

---

## 14. 左子树：`StrikerBrain`

`StrikerBrain` 继承链大致是：

- `StrikerBrain`
  - 继承自 `Skill`
- `Skill`
  - 继承自 `Leaf`
- `Leaf`
  - 继承自 `Task`

因此它本质是一个叶子任务，核心在于不断执行 `execute()`。

---

### 14.1 `StrikerBrain` 初始化目标

在 `init` 中：

```python
self.magic_y = 30
if bb.param.attack_right:
    self.target = VecPos(550, self.magic_y)
else:
    self.target = VecPos(-550, self.magic_y)

bb.attack_target = self.target
```

这里：

- `self.target` 是默认攻击目标
- `bb.attack_target` 也被初始化为这个目标

其中：

```python
self.magic_y = 30
```

这是一个“魔数”，目的是让射门方向在 y 轴上偏一点，不完全打正中，增加防守难度。

---

### 14.2 `StrikerBrain.execute()` 的作用

`execute()` 会读取：

- 机器人位置
- 球的全局位置
- 球门信息

例如：

```python
x = self.bb.vision_info.robot_pos.x
y = self.bb.vision_info.robot_pos.y
ballx = self.bb.vision_info.ball_global.x
bally = self.bb.vision_info.ball_global.y
```

然后根据一系列逻辑更新：

- `self.target.x`
- `self.target.y`

最后写回：

```python
self.bb.attack_target = self.target
self.bb.kick_enabled = True
```

所以 `StrikerBrain` 的主要工作不是直接发动作，而是：

- 计算攻击目标点
- 把结果写进黑板

这是典型的“规划/计算层”。

---

### 14.3 `target.x` 和 `target.y` 的生成

代码里有一系列经验性逻辑，根据：

- 球的位置
- 机器人位置
- 当前是否进攻右侧
- 是否正在使用目标

来动态调整 `target.x` 和 `target.y`。

例如：

- 球离得近时，目标更贴近球门深处
- 球离得远且偏角较大时，调整目标位置
- `target.y` 会根据球的左右位置偏移到 `±magic_y`

这部分看起来规则比较多，也比较经验驱动。

你原文里提到“实机没太看出来效果”，这个判断挺真实：  
很多这种 heuristic 逻辑在代码里写得热闹，到了场上效果未必有想象中那么戏剧化。

---

## 15. 右子树：`Attack` 或 `SeekBall`

`Strike` 的右子树是：

```python
DynamicGuardSelector([
    (Attack(bb), GuardSelector(BallSeen(), TeamBallSeen(), Kicking())),
    (SeekBall(bb), None),
])
```

这就很好理解了：

- 如果满足以下任一条件：
  - `BallSeen()`
  - `TeamBallSeen()`
  - `Kicking()`

  就执行：

```python
Attack(bb)
```

- 否则执行：

```python
SeekBall(bb)
```

### 这里的 `GuardSelector`
它会依次检查内部条件：

- 有一个为 `True` 就返回 `True`
- 全部为 `False` 才返回 `False`

因此可以理解为逻辑“或”。

---

## 16. `Attack(bb)` 的结构

`Attack` 总体也是一个 DGS，分支如下：

```python
(AssistBall(bb), MateBallHandling()),
(AfterAttack(bb), KickSuccess()),
(AttackBall(bb), None)
```

含义是：

1. 如果队友正在处理球：
   - 执行 `AssistBall(bb)`

2. 如果刚刚踢完球：
   - 执行 `AfterAttack(bb)`

3. 否则：
   - 执行 `AttackBall(bb)`

---

## 17. `AssistBall(bb)`：辅助分支

触发条件：

```python
MateBallHandling()
```

本质是：

```python
bb.mate_ball_handling == True
```

你整理出的结构可以表示为：

```text
AssistBall (Parallel)
├── DynamicGuardSelector
│   ├── (GoToAssistPoint(bb), GotOutOfAssist(), GotAssist())
│   └── (Do(bb), None, None)
└── DynamicGuardSelector
    ├── (TrackBall(bb), BallSeen())
    └── (FindBall(bb), None)
```

这里有一个重要细节：

- DGS 一般元素是二元组 `(行为, 守卫)`
- 但这里因为 `use_exit=True`，扩展成了三元组
- 也就是除了进入条件，还会有退出条件

这意味着：

- guard 变成 `False` 时，不会立刻退出
- 而是要等退出条件成立才退出

这是一个很关键的行为树细节。

---

### 17.1 `Do(bb)` 并不是真的“蹲下”

这里的：

```python
Do(bb)
```

实际长期执行的是：

```python
self.action_generator.crouch()
```

返回的是：

```python
BodyCommand(0, 0, 0, BodyCommand.CROUCH)
```

但这里的 `CROUCH` 在当前系统中其实对应的是：

- 步态 `0`
- 即“站着不动”

对应的 planner 侧逻辑类似：

```cpp
case 0: // 站着
    parameters.stp.vel_cmd = {0, 0, 0};
    parameters.stp.gait_type = 0;
    break;
```

所以这里要特别注意：

- 名字叫 `CROUCH`
- 但实际效果不是“蹲下”
- 而是“站着不动”

这确实是一个经典历史遗留命名坑。看到 `CROUCH` 还以为机器人要谦虚地低个头，结果只是原地罚站。

---

## 18. `GoToAssistPoint(bb)` 与 `best_pos`

你提到旧逻辑中 `assist_point` 有一些危险问题，比如：

- 没检查是否出场
- 只考虑了机器人与球的连线
- 没充分考虑持球队友
- 这个辅助点设计本身价值存疑

而现在改用 bhuman 代码后，有了新的方法：

```python
dest = self.bb.best_pos
dest.z = degree_between(robot_pos, ball_global)
```

也就是把辅助位置交给 `bb.best_pos` 计算。

---

### 18.1 `best_pos` 的计算逻辑

`best_pos` 大致如下：

```python
@property
def best_pos(self):
    field_length = self.param.field_length
    field_width = self.param.field_width
    voronoi_region = self.voronoi_region
    sample_points = sample_points_in_voronoi(voronoi_region, num_points=20)
    position_rater = PositionRater(self.param.role)

    best_score = -Inf
    best_point = None

    ball_pos = DBlackboard.vector3_to_tuple(self.vision_info.ball_global)

    for point in sample_points:
        score = position_rater.posRating(
            point,
            ball_pos,
            self.online_mates_pos,
            (-field_length/2, field_length/2, -field_width/2, field_width/2)
        )
        if score > best_score:
            best_point = point
            best_score = score

    current_score = position_rater.posRating(
        self.vision_info.robot_pos,
        self.vision_info.ball_global,
        self.online_mates_pos,
        (-field_length/2, field_length/2, -field_width/2, field_width/2)
    )

    current_pos = DBlackboard.vector3_to_tuple(self.vision_info.robot_pos)

    if best_point is not None:
        best_x, best_y = best_point
        if current_pos is not None:
            current_x, current_y = current_pos
            distance = sqrt((current_x - best_x) ** 2 + (current_y - best_y) ** 2)
        else:
            distance = float("inf")

        score_improvement = best_score - current_score

        self.score_improvement_threshold = 0.1
        self.distance_threshold = 20.0

        if (score_improvement / best_score) > self.score_improvement_threshold and distance > self.distance_threshold:
            best_point = best_point
        else:
            best_point = current_pos
    else:
        best_point = current_pos

    best_pos = VecPos.from_list(best_point)
    return best_pos
```

### 核心流程

1. 计算自己所在的 Voronoi 区域
2. 在该区域采样 20 个点
3. 对每个点打分
4. 取分数最高点作为候选
5. 与当前位置比较：
   - 提升明显
   - 且距离足够大
   - 才更新位置
6. 否则保持当前位置

---

### 18.2 `voronoi_region` 的来源

```python
@property
def voronoi_region(self):
    teammates_pos = dict(self.online_mates_pos)

    my_x = float(self.vision_info.robot_pos.x)
    my_y = float(self.vision_info.robot_pos.y)

    teammates_pos[self.id] = (my_x + 0.01 * self.id, my_y + 0.01 * self.id)

    field_length = self.param.field_length
    field_width = self.param.field_width
    field_bounds = ((-field_length / 2, -field_width / 2), (field_length / 2, field_width / 2))

    voronoi_region = get_voronoi_region(self.id, teammates_pos, field_bounds)
    return voronoi_region
```

### 作用

- 获取当前所有队友位置
- 加入自己的位置
- 加一点偏移，避免重合退化
- 根据场地边界计算自己的 Voronoi 区域

简单理解：

- 整个场地被按“离谁更近”划分成多个区域
- 每个机器人负责自己那一块
- 然后只在自己的区域里选最优点

这个思路比“凭感觉往球旁边站”靠谱得多。

---

### 18.3 `PositionRater`：五个势场打分

`PositionRater` 会根据角色加载参数，例如 striker：

```python
"striker": {
    'ball_weight': 1.8,
    'goal_weight': 1,
    'teammate_weight': -0.6,
    'boundary_weight': -0.8,
    'offensive_bias': 1.4,
    'shooting_angle_weight': 1.3,
    'sigma_ball': 200,
    'sigma_teammate': 100,
    'sigma_boundary': 80,
    'preferred_ball_distance': 80,
    'wide_goal_bonus': 1.2,
}
```

评分公式为：

```python
total_rating = (
    ball_potential +
    goal_potential +
    teammate_potential +
    boundary_potential +
    role_potential
)
```

包括五个势场：

- `ball_potential`
  - 球吸引，离球越近分越高

- `goal_potential`
  - 球门吸引

- `teammate_potential`
  - 队友排斥，避免扎堆

- `boundary_potential`
  - 边界排斥，避免太靠边

- `role_potential`
  - 根据角色增加进攻位置或射门角度加成

你原文提了一个很合理的问题：

> 为什么是离球越近越好，不会直接撞上去吗？

这个疑问完全成立。  
如果 assist 位置也复用了 striker 的进攻评分逻辑，那确实可能导致辅助位太激进，而不是“安全且有效的接应点”。这部分后续很值得单独重构。

---

## 19. `AfterAttack(bb)`：踢完之后的过渡态

这个分支用于避免机器人踢完球后立刻再次重复发起攻击动作。

触发条件是：

```python
KickSuccess()
```

---

### 19.1 `KickSuccess` 的判定逻辑

核心思路如下：

```python
if self.motion_info.status == MotionInfo.KICKING:
    self.kicking = True
else:
    if self.kicking:
        self.timer_kick_success.restart()
    self.kicking = False

return 0 <= self.get_bb().timer_kick_success.elapsed() <= 1
```

配合黑板初始化：

- `timer_kick_success = Timer(left_shift=9999)`
- 初始 `elapsed()` 很大，所以默认 `KickSuccess == False`

### 触发时机

- 当动作状态从 `KICKING` 变成“非 KICKING”时
- 计时器被重置
- 接下来 1 秒内 `KickSuccess == True`

也就是说：

- `KickSuccess` 不是“正在踢”
- 而是“刚踢完的一小段时间窗口”

---

### 19.2 `AfterAttack` 的行为

```python
class AfterAttack(Parallel):
    def init(self, bb):
        args = (Do(bb, 'crouch'), FindBall(bb, look_down=True))
        super(AfterAttack, self).init(*args)

    def run(self):
        self.get_bb().set_state('searching')
        super(AfterAttack, self).run()
```

所以它做的是：

- 一个分支原地不动
- 一个分支重新找球
- 同时把状态切换成 `searching`

其中：

```python
FindBall(bb, look_down=True)
```

这个 `look_down=True` 你已经标了风险点，这个提醒是对的：  
如果头部姿态和视觉策略不匹配，可能导致踢完以后短时间内视野异常，影响重新定位球。

---

## 20. `AttackBall`：真正进攻球的逻辑

你前面已经指出：

- `bb.kicking` 目前代码里一直是 `False`
- 所以一些基于 `kicking` 的分支实际上没真正起作用

这就很有“系统设计得很完整，执行时有个布尔量罢工”的风格。

在这种情况下，最值得看的是：

- `Parallel(GoKick, TrackBall)`

其中 `TrackBall` 很熟悉，重点是 `GoKick`。

---

## 21. `GoKick`：去球并决定踢还是带

`GoKick` 定义如下：

```python
class GoKick(Skill):
    """Go to the ball and kick."""

    def init(self, bb):
        super(GoKick, self).init(bb)
        self.kick_timer = Timer()

    def on_start(self):
        self.kick_timer = Timer()
        self.bb.kicking = False
        self.get_bb().target_used = True

    def on_end(self):
        super(GoKick, self).on_end()

    def execute(self):
        ball_global = VecPos.from_vector3(self.bb.vision_info.ball_global)

        # Kick direction(global) of ball
        target = (self.bb.attack_target - ball_global).slope()

        enable_dribble = False
        robot_pos = VecPos.from_vector3(self.bb.vision_info.robot_pos)

        if self.bb.param.pos_role == 'striker':
            if self.bb.param.attack_right:
                enable_dribble = ball_global.x < -150
            else:
                enable_dribble = ball_global.x >= 150
        else:
            enable_dribble = False

        if enable_dribble:
            self.bb.action_cmd.bodyCmd = self.action_generator.dribble(
                ball_global.x, ball_global.y, target
            )
        else:
            self.bb.action_cmd.bodyCmd = self.action_generator.kick_ball(
                ball_global.x, ball_global.y, target
            )

        return Status.RUNNING
```

---

### 21.1 `GoKick` 的输入

它先读取：

- 球的位置 `ball_global`
- 黑板中的攻击目标 `bb.attack_target`

然后计算：

```python
target = (self.bb.attack_target - ball_global).slope()
```

这个 `target` 就是：

- 从球指向攻击目标的方向角

也就是说，`StrikerBrain` 负责确定“球要往哪打”，`GoKick` 负责根据这个目标去生成动作。

---

### 21.2 什么时候 `dribble`，什么时候 `kick`

核心判断是：

```python
if self.bb.param.pos_role == 'striker':
    if self.bb.param.attack_right:
        enable_dribble = ball_global.x < -150
    else:
        enable_dribble = ball_global.x >= 150
else:
    enable_dribble = False
```

也就是根据：

- 当前角色是不是 striker
- 当前进攻方向
- 球在场地中的 x 坐标

来决定使用：

- `dribble()`
- 或 `kick_ball()`

你原文总结得很直接：

- 现在是**离球门近就 dribble**
- **离球门远就 kick**

虽然这个逻辑听起来有点反直觉，但看代码确实是位置驱动地在切换这两类动作。

---

### 21.3 动作输出

如果 `enable_dribble` 成立：

```python
self.bb.action_cmd.bodyCmd = self.action_generator.dribble(
    ball_global.x, ball_global.y, target
)
```

否则：

```python
self.bb.action_cmd.bodyCmd = self.action_generator.kick_ball(
    ball_global.x, ball_global.y, target
)
```

例如 `dribble` 会生成类似：

```python
BodyCommand(ball_global.x, ball_global.y, target, DRIBBLE=3)
```

最后在主循环中通过：

```python
bb.publish()
```

把 `action_cmd` 发出去。

---

## 22. 这一整套 `Striker` 逻辑怎么理解

可以把它压缩成下面这条主线：

### 1）角色构造
```python
bb = DBlackboard()
cls = find_behavior(bb.param.role)
behavior = cls(bb)
```

### 2）建立根节点
`Striker.init()` 中：

```python
root = DynamicGuardSelector([...])
self.add_child(root)
```

所以：

```python
self.root_task = root
```

### 3）周期执行
```python
bb.reset()
behavior.step()
bb.publish()
```

### 4）根节点选择分支
正常情况下走：

```python
Strike(bb)
```

### 5）`Strike` 并行做两件事
- 左边 `StrikerBrain`
  - 计算攻击目标，写入 `bb.attack_target`

- 右边 DGS
  - 有球或队友有球时 `Attack(bb)`
  - 否则 `SeekBall(bb)`

### 6）`Attack(bb)` 再分三种情况
- 队友控球：`AssistBall`
- 刚踢完球：`AfterAttack`
- 默认：`AttackBall`

### 7）`AttackBall` 最终会进入 `GoKick`
`GoKick` 根据：

- 球位置
- `StrikerBrain` 提供的目标点

决定到底：

- 盘带 `dribble`
- 还是踢球 `kick_ball`

---

## 23. 当前代码里值得特别关注的问题

结合你的笔记，目前至少有这些值得继续盯的点：

### 23.1 `bb.kicking` 基本没更新
你已经指出这一点，这会导致：

- `Kicking()` 守卫可能不符合预期
- 一些“踢球中”相关逻辑形同虚设

---

### 23.2 `assist_point` / `best_pos` 的评分逻辑未必适合辅助位
尤其是：

- “离球越近越高分”
- striker 和 assist 可能复用同一套进攻性评分

这可能让辅助位过度贴球，不够像“接应位”。

---

### 23.3 `Do(bb, 'crouch')` 命名严重误导
代码语义和实际执行效果不一致，非常容易读错。

---

### 23.4 `AfterAttack` 中 `FindBall(look_down=True)` 可能有风险
如果实机视角控制不好，可能影响踢后重新找球。

---

### 23.5 `target` 生成逻辑较经验化
`StrikerBrain` 的目标点更新规则比较 heuristic，需要通过实机和日志进一步验证实际收益。

---

## 24. 一句话总结

这套 `Striker` 行为树的核心结构可以概括为：

**上层通过 `DynamicGuardSelector` 选择当前大分支，`StrikerBrain` 持续计算攻击目标，`Attack/SeekBall` 负责行为切换，最终由 `GoKick` 根据球位置和目标方向决定执行盘带还是踢球。**
```

---



