using System;
using System.Threading;
using System.Runtime.InteropServices;
namespace Ascend.Desktop {
    // Names are scoped to the interactive Windows owner, never to a profile path.
    public sealed class ProductOwner : IDisposable {
        Mutex mutex; EventWaitHandle activation; bool owned;
        public string Outcome {get;private set;}
        public bool Acquired {get{return owned;}}
        public ProductOwner(string sid,string component) {
            if(component!="vision" && component!="hub")throw new ArgumentException("component");
            string basis="Local\\AscendDesktop-"+sid;
            using(var legacy=new Mutex(false,basis)) {
                bool available=false;try {available=legacy.WaitOne(0);}catch(AbandonedMutexException){available=true;}
                if(!available){Outcome="legacy-owner";return;}legacy.ReleaseMutex();
            }
            mutex=new Mutex(false,basis+"-"+component+"-owner");
            try {owned=mutex.WaitOne(0);}catch(AbandonedMutexException){owned=true;}
            string eventName=basis+"-"+component;
            if(!owned) {
                Outcome="activated";
                for(int i=0;i<20;i++) {try {using(var signal=EventWaitHandle.OpenExisting(eventName))signal.Set();break;}catch(WaitHandleCannotBeOpenedException){Thread.Sleep(50);} }
                return;
            }
            activation=new EventWaitHandle(false,EventResetMode.AutoReset,eventName);Outcome="acquired";
        }
        public bool ActivationPending(){return activation!=null && activation.WaitOne(0);}
        public void Dispose(){if(activation!=null)activation.Dispose();if(owned){mutex.ReleaseMutex();owned=false;}if(mutex!=null)mutex.Dispose();}
    }
    public static class NativeWindow {
        [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SetCurrentProcessExplicitAppUserModelID(string id);
        public static void SetProductIdentity(string component){Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID("Ascend.Desktop."+component));}
    }
}
