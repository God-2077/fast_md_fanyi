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

const list = [1, 2, 3, 4, 5]
logger.info( list )
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
}
logger.info( obj )
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
}
logger.info( complexObj )
// [2026-04-28 18:25:25] INFO (kissablecho):
//     age: 22
//     sex: "male"
//     address: {
//         city: "Beijing"
//         street: "100000"
//     }
