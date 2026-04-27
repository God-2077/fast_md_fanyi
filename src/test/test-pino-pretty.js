import pino from 'pino'; // @ts-ignore

const logger = pino({
  transport: {
    targets: [{
      target: 'pino-pretty', options: {
        colorize: true,          // 彩色
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', // 时间格式化
        ignore: 'pid,hostname',  // 忽略字段
        singleLine: false,       // 是否单行输出
        errorProps: 'stack'      // 错误时显示 stack
      }
    },
    // { target: 'pino/file', options: { destination: './app.log' } }
    ]
  }
})

logger.info('Hello info message')
logger.warn('Warning message')
logger.error({ err: new Error('test error') }, 'Error with object')
logger.debug('Debug message')

logger.child({ module: 'auth' }).info('Child logger')