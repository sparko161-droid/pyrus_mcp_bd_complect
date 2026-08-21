import win32serviceutil
import win32service
import win32event
import servicemanager
import os
import subprocess
import sys

class PyrusMCPService(win32serviceutil.ServiceFramework):
    _svc_name_ = "PyrusMCPServer"
    _svc_display_name_ = "Pyrus MCP Server"
    _svc_description_ = "Runs the Pyrus MCP Server (SSE on port 8000) for Antigravity"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.process = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        if self.process:
            self.process.terminate()

    def SvcDoRun(self):
        servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE,
                              servicemanager.PYS_SERVICE_STARTED,
                              (self._svc_name_,''))
        self.main()

    def main(self):
        # Determine paths relative to this script
        base_dir = os.path.dirname(os.path.abspath(__file__))
        pyrus_dir = os.path.join(base_dir, "pyrus_mcp_server")
        python_exe = os.path.join(pyrus_dir, ".venv", "Scripts", "python.exe")
        log_path = os.path.join(base_dir, "mcp_service.log")

        env = os.environ.copy()
        
        with open(log_path, "a") as log_file:
            self.process = subprocess.Popen(
                [python_exe, "-m", "pyrus_mcp.server"],
                cwd=pyrus_dir,
                env=env,
                stdout=log_file,
                stderr=subprocess.STDOUT
            )
        
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)

if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(PyrusMCPService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(PyrusMCPService)
