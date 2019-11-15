#!/usr/bin/env node
'use strict'
const path = require('path')
const fs = require('fs')
const fsPromises = require('fs').promises
const commander = require('commander')
const moment = require('moment')
const shell = require('shelljs')
const inquirer = require('inquirer');

const pkg = require('./package')
console.log('cwd', process.cwd())
const program = new commander.Command()
program.version(pkg.version)

program
  .requiredOption('-s, --src <path>', '【必要】需要清理的文件夹路径')
  .requiredOption('-d, --dest <path>', '【必要】文件转移位置')
  .option('-m, --mode <string>', '操作模式，复制[cp]，移动[mv]，查看[ls]', 'ls')
  .option('-t, --timeout <number>', '过期天数，不小于90', 90)
  .option('-r, --retain <number>', '已删除文件保留天数，不小于7', 15)
  .option('-f, --force <boolean>', '当传入的 timeout，retain 小于限制的值时，强制使用', boolParse, false)
  .option('-l, --log <boolean>', '输出日志', boolParse, true)
  .option('-v, --verb <boolean>', '输出详细日志', boolParse, false)
  .option('-o, --onlytrash <boolean>', '只清理回收站', boolParse, false)
  .option('-c, --confirm <boolean>', '自动确认按参数执行，适用于自动化脚本', boolParse, false)
  // .option('-p, --pattern <string>', '文件夹名称匹配模式', /\d{4}-\d{2}-\d{2}/g)

program.parse(process.argv)
if (!program.src) {
  console.error('请指定需要清理的目录，使用： -s --src')
  process.exit(1)
}
if (!program.dest) {
  console.error('请指文件转移位置，使用： -d --dest')
  process.exit(1)
}

// const DELIMITER = '#' //路径扁平化分隔符
const FILE_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}$/ //需要操作的文件的名称匹配模式
const dateString = moment().format('YYYY-MM-DD')

// 参数
const SRC_PATH = path.resolve(process.cwd(), program.src)  // eg. /a/b/c
const DEST_PATH = path.resolve(process.cwd(), program.dest) // eg. /d/s
const MODE = program.mode
const FORCE = program.force
const TIMEOUT_DAY = !program.timeout || (program.timeout < 90 && !FORCE) ?
  90 : Math.ceil(Math.abs(program.timeout));
const LOG = program.log; //是否打印日志
const VERB = program.verb; //是否打印详细日志
// const PATTERN = program.pattern; //文件夹匹配模式
// const RETAIN_DAYS = program.retain<7 ? 7 : Math.ceil(Math.abs(program.retain)); //回收站保留天数
const RETAIN_DAYS = !program.retain || (program.retain < 7 && !FORCE) ?
  7 :  Math.ceil(Math.abs(program.retain)); //回收站保留天数
const ONLY_TRASH = program.onlytrash;
const AUTO_CONFIRM = program.confirm;

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

if(SRC_PATH == DEST_PATH){
  console.error('src和dest不能相同')
  process.exit(1)
}
const TRASH_ROOT = DEST_PATH + SRC_PATH // eg. /d/s/a/b/c
const trashPath = path.resolve(TRASH_ROOT, dateString) // eg/ /d/s/a/b/c/2019-10-10

start()

async function start() {
  console.info('===================================')
  log.info(
    '搜索目录:', SRC_PATH, 
    '\n回收目录:', trashPath, 
    '\n操作模式:', MODE,
    '\n文件有效期（天）:', TIMEOUT_DAY, 
    '\n回收站保留期（天）:', RETAIN_DAYS,
    '\n强制减少有效期:', FORCE,
    '\n输出日志:', LOG,
    '\n详细日志:', VERB,
    '\n只清理回收站:', ONLY_TRASH,
    '\n自动确认执行:', AUTO_CONFIRM,
    )
  console.info('===================================')
  try {
    if(!AUTO_CONFIRM){
      let answers = await inquirer.prompt([{
        name: 'confirmRun',
        type: 'confirm',
        message: '是否确认执行？',
        default: false,
      }])
      if(!answers.confirmRun){
        console.log('确认不执行，退出！')
        process.exit()
      }
    }
    //只有复制和移动模式下创建回收站目录
    if(['cp','mv'].includes(MODE)&& !ONLY_TRASH){
      await fsPromises.mkdir(trashPath, {
        recursive: true
      })
      log.verb(`回收站主目录:${TRASH_ROOT}, 今日回收站目录:${trashPath}`)
    }
    
    log.info('开始:', moment().format())
    log.info('清理回收站...')
    await trashClean()
    if(ONLY_TRASH){
      return;
    }
    log.info('清理回收站完成!')
    await clear(SRC_PATH, true)
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
    if (filePath == TRASH_ROOT) {
      log.verb('回收站，不处理', fileName)
      continue;
    }
    //非文件夹不处理
    if (!fileStat.isDirectory()) {
      log.verb('非文件夹，不处理', fileName)
      continue;
    }

    log.verb(`开始处理:${fileName}; 
    文件夹？${fileStat.isDirectory()}; 
    回收站？${fileName==TRASH_ROOT}; 
    最后修改:${mtime}; 
    时间差:${timeDiff}; 
    名称合法？${FILE_NAME_PATTERN.test(fileName)}; 
    过期？${timeDiff > TIMEOUT_DAY}`
    )

    let nameValid = FILE_NAME_PATTERN.test(fileName)
    // let nameValid = PATTERN.test(fileName)
    let expired = timeDiff > TIMEOUT_DAY
    // 符合指定命名格式，且最后修改日期大于指定过期时间
    if (nameValid) {
      if (expired) {
        log.verb('符合条件，准备处理')
        let relativePath = path.relative(SRC_PATH, dirPath)
        let targetPath = path.resolve(trashPath, relativePath)
        try{
          await fsPromises.access(filePath, fs.constants.W_OK)
        }catch(e){
          log.verb('无访问${filePath}权限，跳过')
          continue;
        }
        if (MODE === 'ls') {
          // 查看模式
          log.info(`找到: ${filePath}`)
          continue
        }

        try {
          await fsPromises.access(targetPath)
        } catch (e) {
          log.verb('不存在，创建')
          await fsPromises.mkdir(targetPath, {recursive: true})
        }

        if (MODE === 'cp') {
          // 复制模式
          try{
            let rs = shell.cp('-rf', filePath, targetPath)
            await fsPromises.utimes(path.resolve(targetPath, fileName), atime, mtime) //保留时间戳
            log.info(`复制 ${filePath} 到 ${targetPath} ${rs.stderr?'失败['+rs.stderr+']':'成功'}!`)
          }catch(e){
            log.info(`复制 ${filePath} 到 ${targetPath} 失败:${e.message}`)
          }
          continue;
        }  
        if (MODE === 'mv') {
          // 移动模式
          try{
            await fsPromises.rename(filePath, path.resolve(targetPath, fileName))
            // await fsPromises.utimes(path.resolve(targetPath, fileName), atime, mtime) //保留时间戳
            log.info(`移动 ${filePath} 到 ${targetPath} 成功!`)
          }catch(e){
            log.info(`移动 ${filePath} 到 ${targetPath} 失败:${e.message}`)
          }
          continue;
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


async function trashClean(){
  try{
    await fsPromises.access(TRASH_ROOT)
  }catch(e){
    log.err('回收站不存在，不需要清除')
    return;
  }
  let stat = await fsPromises.stat(TRASH_ROOT)
  if(stat.isDirectory()){
    let dateDirsList = await fsPromises.readdir(TRASH_ROOT)
    log.verb('回收站列表：', dateDirsList)
    log.info('开始扫描回收站...')
    for(let dateDir of dateDirsList){
      let dailyTrashPath = path.resolve(TRASH_ROOT, dateDir)
      let st = await fsPromises.stat(dailyTrashPath)
      let mtime = st.mtime
      // let trashDate = moment(ctime);
      if(!FILE_NAME_PATTERN.test(dateDir)){
        continue;
      }
      let trashDate = moment(dateDir, 'YYYY-MM-DD');
      let timeDiff = moment().diff(trashDate, 'day') //时差
      log.verb(`回收站文件:${dailyTrashPath}, 删除日期:${trashDate}, 删除天数:${timeDiff}`)
      if(timeDiff > RETAIN_DAYS){
        // await fsPromises.rmdir(tPath)
        shell.rm('-r', dailyTrashPath)
        log.info(`删除过期文件：${dailyTrashPath}`)
      }
    }
  }
}

function boolParse(bool){
  if(bool && bool.toLowerCase()!=='false'){
    // console.log('boolParse',bool, true)
    return true
  }
  // console.log('boolParse',bool, false)
  return false
}