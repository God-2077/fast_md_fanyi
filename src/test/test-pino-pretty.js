import pino from 'pino'; // @ts-ignore
const logger = pino({
    transport: {
        targets: [{
                target: 'pino-pretty', options: {
                    colorize: true, // 彩色
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', // 时间格式化
                    ignore: 'pid,hostname', // 忽略字段
                    singleLine: false, // 是否单行输出
                    errorProps: 'stack' // 错误时显示 stack
                }
            },
            // { target: 'pino/file', options: { destination: './app.log' } }
        ]
    }
});
logger.info('Hello info message');
logger.warn('Warning message');
logger.error({ err: new Error('test error') }, 'Error with object');
logger.debug('Debug message');
logger.child({ module: 'auth' }).info('Child logger');
const list = [1, 2, 3, 4, 5];
logger.info(list);
// [2026-04-28 18:25:25] INFO:
//     0: 1
//     1: 2
//     2: 3
//     3: 4
//     4: 5
const obj = {
    name: 'kissablecho',
    age: 22,
    sex: 'male'
};
logger.info(obj);
// [2026-04-28 18:25:25] INFO (kissablecho):
//     age: 22
//     sex: "male"
// 复杂的 object
// name 字段会作为 [2026-04-28 18:25:25] INFO (kissablecho) 中的 (kissablecho)
const complexObj = {
    name: 'kissablecho',
    age: 22,
    sex: 'male',
    address: {
        city: 'Beijing',
        street: '100000'
    }
};
logger.info(complexObj);
// [2026-04-28 18:25:25] INFO (kissablecho):
//     age: 22
//     sex: "male"
//     address: {
//         city: "Beijing"
//         street: "100000"
//     }
// 中文测试
logger.info('中文测试');
logger.warn('中文警告测试');
logger.child({ module: 'auth' }).info('Child logger');
logger.child({ module: 'module2' }).info('3 logger');
// ==================== 更多子日志器示例 ====================
// 1. 创建可复用的子日志器，绑定模块信息
const authLogger = logger.child({ module: 'auth' });
authLogger.info('用户登录', { userId: 123 });
authLogger.warn('密码快过期', { userId: 123, remainingDays: 5 });
// 2. 子日志器可继续派生子日志器，实现多层上下文
const requestLogger = logger.child({ reqId: 'abc-123' });
const dbLogger = requestLogger.child({ component: 'database' });
dbLogger.info('查询用户表', { sql: 'SELECT * FROM users WHERE id=?' });
dbLogger.error({ err: new Error('连接超时') }, '数据库连接失败');
// 3. 为每个请求创建独立的子日志器 (模拟中间件场景)
function handleRequest(reqId, userId) {
    const reqLog = logger.child({ reqId, userId });
    reqLog.info('开始处理请求');
    // 业务逻辑...
    reqLog.info('请求处理完成');
}
handleRequest('req-001', 1001);
handleRequest('req-002', 1002);
// 4. 子日志器可以拥有独立的日志级别
const verboseLogger = logger.child({ module: 'verbose' }, { level: 'trace' }); // pino 中 trace 等效 debug 以下
verboseLogger.level = 'debug'; // 动态修改级别
verboseLogger.debug('这是一条仅在该子日志器中可见的调试信息');
verboseLogger.trace('这条 trace 不会被输出，因为级别设为 debug');
// 5. 查看子日志器当前绑定的数据 (bindings)
const child = logger.child({ service: 'api', version: 'v2' });
console.log('子日志器绑定数据:', child.bindings()); // { service: 'api', version: 'v2' }
// 6. 子日志器与错误对象的结合
const errorLogger = logger.child({ module: 'payment' });
try {
    throw new Error('余额不足');
}
catch (err) {
    errorLogger.error({ err, orderId: 987 }, '支付失败');
}
// 7. 使用 child 但不覆盖父级已绑定字段，而是合并
const base = logger.child({ env: 'production' });
const worker1 = base.child({ worker: 1 });
const worker2 = base.child({ worker: 2 });
worker1.info('Worker started');
worker2.info('Worker started');
// 输出会包含 env 和各自的 worker ID
// 8. 在异步流程中传递子日志器
async function processOrder(orderId) {
    const log = logger.child({ orderId });
    log.info('订单处理开始');
    await new Promise(resolve => setTimeout(resolve, 10)); // 模拟异步
    log.info('订单处理结束');
}
processOrder(5566);