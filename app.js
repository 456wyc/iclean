#!/usr/bin/env node
'use strict'
const path = require('path')
const fsPromises = require('fs').promises
const commander = require('commander')
const moment = require('moment')
const shell = require('shelljs')
const pkg = require('./package')
console.log('cwd', process.cwd())
const program = new commander.Command()
program.version(pkg.version)

program
  .requiredOption('-d, --dir <path>', '【必要】需要清理的文件夹路径')
  .option('-m, --mode <string>', '操作模式，复制[cp]，移动[mv]，查看[ls]', 'ls')
  .option('-t, --timeout <number>', '过期天数，不小于90', 90)
  .option('-f, --force <boolean>', '强制使用小于90天的参数', false)
  .option('-l, --log <boolean>', '输出日志', true, Boolean.parse)
  .option('-v, --verb <boolean>', '输出详细日志', false)
  // .option('-p, --pattern <string>', '文件夹名称匹配模式', /\d{4}-\d{2}-\d{2}/g)

program.parse(process.argv)
if (!program.dir) {
  console.error('请指定文件目录，使用： --dir')
  process.exit(1)
}

const rootPath = path.resolve(process.cwd(), program.dir)
const MODE = program.mode
const FORCE = program.force
const timeoutDay = !program.timeout || (program.timeout < 90 && !FORCE) ?
  90 : Math.ceil(Math.abs(program.timeout));
const LOG = program.log; //是否打印日志
const VERB = program.verb; //是否打印详细日志
// const PATTERN = program.pattern; //文件夹匹配模式
const FILE_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}$/ //需要操作的文件的名称匹配模式
const TRASH_ROOT_DIR_NAME = '_trash' //回收站文件夹名称
// const DELIMITER = '#' //路径扁平化分隔符

const log = {
  verb() {
    if (LOG && VERB) {
      console.log(...arguments)
    }
  },
  info() {
    if (LOG && LOG != 'false') {
      console.log(...arguments)
    }
  },
  err() {
    console.error(...arguments)
  }
}

log.info('搜索目录:', rootPath, '有效期:', timeoutDay, '操作模式:', MODE)

const dateString = moment().format('YYYY-MM-DD')
const trashPath = path.resolve(rootPath, TRASH_ROOT_DIR_NAME, dateString)

start()

async function start() {
  try {
    await fsPromises.mkdir(trashPath, {
      recursive: true
    })
    log.info('开始:', moment().format())
    await clear(rootPath, true)
    log.info('结束:', moment().format())
  } catch (e) {
    log.err('异常：', e)
    process.exit()
  }
}


async function clear(dirPath, isRoot) {
  log.verb('开始搜索:', dirPath)
  let dirStat = await fsPromises.stat(dirPath)
  if (!dirStat.isDirectory()) {
    log.verb('不是文件夹, 不处理', dirPath)
    return;
  }
  let filesList = await fsPromises.readdir(dirPath)
  log.verb('文件列表:', filesList.join(' | '))
  for (let fileName of filesList) {
    let filePath = path.resolve(dirPath, fileName);
    let fileStat = await fsPromises.stat(filePath);
    let atime = fileStat.atime
    let mtime = fileStat.mtime
    let ctime = fileStat.ctime
    let timeDiff = moment().diff(moment(mtime), 'day') //时差

    //回收站不处理
    if (fileName == TRASH_ROOT_DIR_NAME) {
      log.verb('回收站，不处理', fileName)
      continue;
    }
    //非文件夹不处理
    if (!fileStat.isDirectory()) {
      log.verb('非文件夹，不处理', fileName)
      continue;
    }

    log.verb(`开始处理:${fileName}; 文件夹？${fileStat.isDirectory()}; 回收站？${fileName==TRASH_ROOT_DIR_NAME}; 最后修改:${mtime}; 时间差:${timeDiff}; 名称合法？${FILE_NAME_PATTERN.test(fileName)}; 过期？${timeDiff > timeoutDay}`)

    let nameValid = FILE_NAME_PATTERN.test(fileName)
    // let nameValid = PATTERN.test(fileName)
    let expired = timeDiff > timeoutDay
    // 符合指定命名格式，且最后修改日期大于指定过期时间
    if (nameValid) {
      if (expired) {
        log.verb('符合条件，准备处理')
        let relativePath = path.relative(rootPath, dirPath)
        // let targetName = relativePath.replace(/\//g, DELIMITER)
        // let targetPath = path.resolve(trashPath, targetName)
        let targetPath = path.resolve(trashPath, relativePath)

        try {
          await fsPromises.access(targetPath)
        } catch (e) {
          log.verb('不存在，创建')
          await fsPromises.mkdir(targetPath, {recursive: true})
        }

        if (MODE === 'cp') {
          // 复制模式
          let rs = shell.cp('-rf', filePath, targetPath)
          await fsPromises.utimes(path.resolve(targetPath, fileName), atime, mtime) //保留时间戳
          log.info(`复制 ${filePath} 到 ${targetPath} ${rs.stderr?'失败['+rs.stderr+']':'成功'}!`)
        } else if (MODE === 'mv') {
          // 移动模式
          await fsPromises.rename(filePath, path.resolve(targetPath, fileName))
          await fsPromises.utimes(path.resolve(targetPath, fileName), atime, mtime) //保留时间戳
          log.info(`移动 ${filePath} 到 ${targetPath} 成功!`)
        } else if (MODE === 'ls') {
          // 查看模式
          log.info(`找到: ${filePath}`)
        } else {
          // 其他模式，不处理
        }
      } else {
        log.verb('有效期内，不处理')
      }
      continue;
    }
    //其他文件夹
    await clear(filePath, false)
  }
  return;
}