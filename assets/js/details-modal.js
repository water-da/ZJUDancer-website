$(document).ready(function() {
    // 1. 将 HTML 结构定义为模板字符串 (Template Literal)
    const modalHTML = `
    <div id="details-overlay" class="details-overlay">
        <button class="close-btn" id="close-details">✕ 返回首页</button>
        <div class="details-container">
            <nav class="sidebar-nav">
                <ul id="topic-tabs">
                    <li><a href="#" data-target="vision" class="active">👁️ 视觉系统</a></li>
                    <li><a href="#" data-target="motion">⚙️ 运动控制</a></li>
                    <li><a href="#" data-target="strategy">🧠 战术决策</a></li>
                </ul>
            </nav>
            <div class="content-area">
                <div id="vision" class="topic-content active">
                    <h2>视觉系统 (Vision System)</h2>
                    <p>这里是视觉系统的详细介绍。你可以随时在 JS 文件中修改这里的文本或添加图片标签。</p>
                </div>
                <div id="motion" class="topic-content">
                    <h2>运动控制 (Motion Control)</h2>
                    <p>基于倒立摆模型和零矩点理论，我们的机器人能够实现快速且稳定的全向移动...</p>
                </div>
                <div id="strategy" class="topic-content">
                    <h2>战术决策 (Strategy & AI)</h2>
                    <p>通过高效的局域网通信，场上的机器人能够共享视野，并利用行为树进行实时的角色分配...</p>
                </div>
            </div>
        </div>
    </div>
    `;

    // 2. 将这段 HTML 动态追加到 body 的末尾
    $('body').append(modalHTML);

    // 3. 绑定交互事件
    // 打开详情页
    $('.open-details').on('click', function(e) {
        e.preventDefault();
        var targetTopic = $(this).data('topic'); // 获取点击的是哪个模块
        
        // 自动切换到对应的左侧标签
        $('#topic-tabs a[data-target="' + targetTopic + '"]').click();
        
        // 显示遮罩层并锁定底层滚动
        $('#details-overlay').fadeIn(300);
        $('body').css('overflow', 'hidden');
    });

    // 关闭详情页
    $('#close-details').on('click', function() {
        $('#details-overlay').fadeOut(300);
        $('body').css('overflow', 'auto');
    });

    // 内部标签页切换
    $('#topic-tabs a').on('click', function(e) {
        e.preventDefault();
        $('#topic-tabs a').removeClass('active');
        $(this).addClass('active');
        
        var targetId = $(this).data('target');
        $('.topic-content').removeClass('active');
        $('#' + targetId).addClass('active');
    });
});
