' 隐藏静默启动本机 cookie 代理(cookie_agent.py),无控制台窗口、无终端。
' 用法:
'   - 双击本文件即隐藏启动;
'   - 开机自启:Win+R 输入 shell:startup,把本文件的"快捷方式"放进打开的"启动"文件夹。
' 依赖:本机已装 Python 且 pythonw 在 PATH、已 pip install requests。
' 停止:任务管理器结束 pythonw.exe;或命令行 taskkill /f /im pythonw.exe
' 判断是否在跑:netstat -ano | findstr 8765,或平台 /data 页显示"本机代理:已连接"。
Dim fso, shell, dir, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)   ' 本 vbs 所在目录 = client/
cmd = "pythonw """ & dir & "\cookie_agent.py"""
shell.Run cmd, 0, False                                  ' 0=隐藏窗口, False=不等待
