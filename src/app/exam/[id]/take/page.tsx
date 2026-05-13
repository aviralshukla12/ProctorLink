
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Camera, Timer, CheckCircle, GraduationCap, Bookmark, BookmarkCheck, Save, Clock } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface TestCase {
  input: string;
  output: string;
}

interface TestCaseResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  status: string;
  passed: boolean;
}

interface Question {
    type?: 'mcq' | 'coding';
    questionText: string;
    options?: string[];
    correctAnswer?: string;
    timeLimit?: number;
    problemStatement?: string;
    starterCode?: string;
    sampleInput?: string;
    sampleOutput?: string;
    testCases?: TestCase[];
}

interface Exam {
    title: string;
    timeLimit?: number;
    perQuestionTimer: boolean;
    questions: Question[];
    isPaused?: boolean;
}

export default function TakeExamPage() {
  const router = useRouter();
  const params = useParams();
  const examId = params.id as string;
  const { toast } = useToast();
  const { user } = useAuth();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<(string | null)[]>([]);
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [dialogMessage, setDialogMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [testCaseResults, setTestCaseResults] = useState<TestCaseResult[] | null>(null);
  const [selectedTestCase, setSelectedTestCase] = useState<number>(0);
  const [selectedLanguage, setSelectedLanguage] = useState(63); // 63 is JavaScript in Judge0
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  const submitExam = useCallback(async () => {
      if (isSubmitting || !exam) return;
      setIsSubmitting(true);
      if(timerRef.current) clearInterval(timerRef.current);
      
      let score = 0;
      // We will perform basic scoring here for MCQ, and auto-grade coding async later
      exam.questions.forEach((q, index) => {
          if((q.type === 'mcq' || !q.type) && q.correctAnswer === answers[index]){
              score++;
          }
      });

      // Use logged-in user data if available, otherwise use localStorage
      const participantName = user ? (user.displayName || 'Student') : localStorage.getItem('proctorlink-participant-name') || 'Anonymous';
      const participantEmail = user?.email || localStorage.getItem('proctorlink-participant-email') || 'No Email';
      const collegeName = localStorage.getItem('proctorlink-participant-college') || 'N/A';
      const passingYear = localStorage.getItem('proctorlink-participant-year') || 'N/A';
      
      try {
        await addDoc(collection(db, 'submissions'), {
            examId,
            examTitle: exam.title,
            participantName,
            participantEmail,
            collegeName,
            passingYear,
            userId: user?.uid || null, // Link to user account
            answers,
            score,
            totalQuestions: exam.questions.length,
            submittedAt: serverTimestamp(),
            warningCount,
        });
        
        // Clean up localStorage
        localStorage.removeItem('proctorlink-participant-name');
        localStorage.removeItem('proctorlink-participant-email');
        localStorage.removeItem('proctorlink-participant-college');
        localStorage.removeItem('proctorlink-participant-year');
        localStorage.removeItem('proctorlink-student-photo');
        localStorage.removeItem('proctorlink-id-photo');
        localStorage.removeItem(`proctorlink-exam-${examId}-progress`);
        
        // Stop camera/proctor after successful submission
        if (videoRef.current && videoRef.current.srcObject) {
          (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        }
        
        router.push(`/exam/results?examId=${examId}`);

      } catch (error) {
        console.error("Error submitting exam:", error);
        toast({ title: "Submission Failed", description: "Could not submit your exam. Please try again.", variant: "destructive" });
        setIsSubmitting(false);
      }
  }, [exam, answers, examId, isSubmitting, router, toast, warningCount]);
  
  const goToQuestion = (index: number) => {
    if (exam && index >= 0 && index < exam.questions.length) {
      setTestCaseResults(null);
      setCurrentQuestionIndex(index);
    }
  };

  const handleNext = () => {
    if (exam && currentQuestionIndex < exam.questions.length - 1) {
        setTestCaseResults(null);
        setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
      if(currentQuestionIndex > 0){
          setTestCaseResults(null);
          setCurrentQuestionIndex(prev => prev - 1);
      }
  }

  const runCode = async () => {
    const code = answers[currentQuestionIndex];
    if (!code) {
      toast({ title: "No Code", description: "Please write some code before running.", variant: "destructive" });
      return;
    }
    const q = exam?.questions[currentQuestionIndex];
    if (!q) return;

    setIsExecuting(true);
    setTestCaseResults(null);
    setSelectedTestCase(0);
    
    const tcs = [];
    if (q.sampleInput || q.sampleOutput) {
       tcs.push({ input: q.sampleInput || '', output: q.sampleOutput || '' });
    }
    if (q.testCases && q.testCases.length > 0) {
       tcs.push(...q.testCases);
    }
    if (tcs.length === 0) {
       tcs.push({ input: '', output: '' });
    }

    try {
      const results = [];
      for (const tc of tcs) {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_code: code,
            language_id: selectedLanguage,
            stdin: tc.input,
            expected_output: tc.output
          })
        });
        const data = await res.json();
        
        let output = '';
        let passed = false;
        let status = 'Error';
        
        if (data.error) {
          status = 'Error';
          output = data.error;
        } else if (data.message) {
          status = 'API Error';
          output = data.message;
        } else {
          output = [data.stdout, data.compile_output, data.stderr]
            .filter(Boolean)
            .join('\n')
            .trim();
          status = data.status?.description || 'Done';
          passed = status.includes('Accepted');
        }
        
        results.push({
          input: tc.input,
          expectedOutput: tc.output,
          actualOutput: output || 'No output produced.',
          status,
          passed
        });

        // Add a delay to avoid hitting rate limits (Judge0 Basic is 1 req/sec)
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      setTestCaseResults(results);
    } catch (err) {
      console.error(err);
      toast({ title: "Execution Failed", description: "Failed to connect to execution server.", variant: "destructive" });
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleBookmark = (questionIndex: number) => {
    setBookmarkedQuestions(prev => {
      const newBookmarks = new Set(prev);
      if (newBookmarks.has(questionIndex)) {
        newBookmarks.delete(questionIndex);
        toast({
          title: "Bookmark Removed",
          description: `Question ${questionIndex + 1} unmarked for review.`,
        });
      } else {
        newBookmarks.add(questionIndex);
        toast({
          title: "Question Bookmarked",
          description: `Question ${questionIndex + 1} marked for review.`,
        });
      }
      return newBookmarks;
    });
  };

  const autoSave = useCallback(() => {
    if (!exam || !examId) return;
    
    const saveData = {
      examId,
      answers,
      bookmarkedQuestions: Array.from(bookmarkedQuestions),
      currentQuestionIndex,
      timeLeft,
      lastSaved: new Date().toISOString(),
    };
    
    localStorage.setItem(`proctorlink-exam-${examId}-progress`, JSON.stringify(saveData));
    setLastSaved(new Date());
  }, [exam, examId, answers, bookmarkedQuestions, currentQuestionIndex, timeLeft]);


  useEffect(() => {
    if (!examId) return;

    const fetchExam = async () => {
        try {
            const docRef = doc(db, "exams", examId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const examData = docSnap.data() as Exam;
                
                // Check if exam is paused
                if (examData.isPaused) {
                  toast({
                    variant: "destructive",
                    title: "Exam is Over",
                    description: "This exam has been paused by the administrator and is no longer available.",
                  });
                  router.push(`/exam/${examId}`);
                  return;
                }
                
                setExam(examData);
                
                // Try to load saved progress
                const savedProgress = localStorage.getItem(`proctorlink-exam-${examId}-progress`);
                if (savedProgress) {
                  try {
                    const progressData = JSON.parse(savedProgress);
                    setAnswers(progressData.answers || new Array(examData.questions.length).fill(null));
                    setBookmarkedQuestions(new Set(progressData.bookmarkedQuestions || []));
                    setCurrentQuestionIndex(progressData.currentQuestionIndex || 0);
                    if (progressData.timeLeft && !examData.perQuestionTimer) {
                      setTimeLeft(progressData.timeLeft);
                    } else if (!examData.perQuestionTimer) {
                      setTimeLeft((examData.timeLimit || 30) * 60);
                    }
                    toast({
                      title: "Progress Restored",
                      description: "Your previous progress has been restored.",
                    });
                  } catch (error) {
                    console.error('Error loading saved progress:', error);
                    setAnswers(new Array(examData.questions.length).fill(null));
                    if (!examData.perQuestionTimer) {
                      setTimeLeft((examData.timeLimit || 30) * 60);
                    }
                  }
                } else {
                  setAnswers(new Array(examData.questions.length).fill(null));
                  if (!examData.perQuestionTimer) {
                    setTimeLeft((examData.timeLimit || 30) * 60);
                  }
                }
            } else {
                toast({ title: "Error", description: "Exam not found.", variant: "destructive" });
                router.push('/');
            }
        } catch (error) {
            console.error("Error fetching exam:", error);
            toast({ title: "Error", description: "Failed to load the exam.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };
    fetchExam();
  }, [examId, router, toast]);

  useEffect(() => {
    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions to start the exam.',
        });
      }
    };
    getCameraPermission();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setWarningCount(c => c + 1);
        setDialogMessage(`You have switched tabs. This is your warning #${warningCount + 1}.`);
        setShowWarningDialog(true);
        toast({ title: 'Warning: Tab Switch Detected', variant: 'destructive' });
      }
    };
    const handleCopyPaste = (e: ClipboardEvent) => { e.preventDefault(); setWarningCount(c => c + 1); toast({ title: 'Warning: Copy/Paste Disabled', variant: 'destructive' }); };
    
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+B or Cmd+B to bookmark current question
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleBookmark(currentQuestionIndex);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('keydown', handleKeyPress);
    window.addEventListener('copy', handleCopyPaste);
    window.addEventListener('paste', handleCopyPaste);
    window.addEventListener('cut', handleCopyPaste);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('copy', handleCopyPaste);
      window.removeEventListener('paste', handleCopyPaste);
      window.removeEventListener('cut', handleCopyPaste);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      if(timerRef.current) clearInterval(timerRef.current);
      if(autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [warningCount, toast]);

  // Auto-save effect
  useEffect(() => {
    if (!exam || loading || isSubmitting) return;

    // Auto-save every 30 seconds
    if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    
    autoSaveRef.current = setInterval(() => {
      autoSave();
    }, 30000); // 30 seconds

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [exam, loading, isSubmitting, autoSave]);

  // Save progress when answers or bookmarks change
  useEffect(() => {
    if (!exam || loading) return;
    
    const saveTimeout = setTimeout(() => {
      autoSave();
    }, 2000); // Save 2 seconds after change

    return () => clearTimeout(saveTimeout);
  }, [answers, bookmarkedQuestions, autoSave, exam, loading]);

  // Timer logic
  useEffect(() => {
    if (loading || isSubmitting || !hasCameraPermission || !exam) return;

    if (timerRef.current) clearInterval(timerRef.current);

    let shouldAutoAdvance = false;

    if (exam.perQuestionTimer) {
      const questionTime = exam.questions[currentQuestionIndex]?.timeLimit || 60;
      if (timeLeft <= 0 || currentQuestionIndex !== answers.findIndex(a => a === null)) { // Reset timer for new questions
           setTimeLeft(questionTime);
      }
      shouldAutoAdvance = true;
    }

    if (timeLeft <= 0) {
      if(shouldAutoAdvance && currentQuestionIndex < exam.questions.length - 1) {
        handleNext();
      } else {
        submitExam();
      }
      return;
    }

    timerRef.current = setInterval(() => setTimeLeft(t => t - 1), 1000);

    return () => {
      if(timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading, isSubmitting, hasCameraPermission, exam, timeLeft, currentQuestionIndex, answers, submitExam, handleNext]);
  
  if (loading || !exam) {
      return <div className="flex items-center justify-center min-h-screen">Loading exam...</div>;
  }

  const currentQuestion = exam.questions[currentQuestionIndex];
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColor = (seconds: number, totalTime: number) => {
    const percentage = (seconds / totalTime) * 100;
    if (percentage > 50) return 'text-green-600';
    if (percentage > 25) return 'text-yellow-600';
    if (percentage > 10) return 'text-orange-600';
    return 'text-red-600 animate-pulse';
  };

  const getTimerBgColor = (seconds: number, totalTime: number) => {
    const percentage = (seconds / totalTime) * 100;
    if (percentage > 50) return 'bg-green-50 border-green-200';
    if (percentage > 25) return 'bg-yellow-50 border-yellow-200';
    if (percentage > 10) return 'bg-orange-50 border-orange-200';
    return 'bg-red-50 border-red-200';
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-brand-light/10 to-brand-medium/5 p-4 md:p-8">
       {!hasCameraPermission && (
          <Card className="w-full max-w-4xl z-20 mb-4">
              <CardHeader>
                <CardTitle>Camera & Microphone Required</CardTitle>
                <div className="text-xs text-brand-primary/80 font-medium">
                  🔒 Secured 
                </div>
              </CardHeader>
              <CardContent>
                  <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Action Required</AlertTitle>
                      <AlertDescription>
                         Please grant camera and microphone access in your browser to begin the exam.
                      </AlertDescription>
                  </Alert>
              </CardContent>
          </Card>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 w-full max-w-[1600px]">
        <Card className="w-full z-10 order-2 lg:order-1">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div className="flex items-center gap-4">
              <CardTitle>{exam.title} - Question {currentQuestionIndex + 1}</CardTitle>
              <Button
                onClick={() => toggleBookmark(currentQuestionIndex)}
                variant="ghost"
                size="sm"
                className="flex items-center gap-2"
                title="Bookmark this question for review (Ctrl+B)"
              >
                {bookmarkedQuestions.has(currentQuestionIndex) ? (
                  <BookmarkCheck className="h-4 w-4 text-yellow-600" />
                ) : (
                  <Bookmark className="h-4 w-4 text-gray-400" />
                )}
                <span className="text-sm">
                  {bookmarkedQuestions.has(currentQuestionIndex) ? 'Bookmarked' : 'Bookmark'}
                </span>
                <span className="text-xs text-gray-400 hidden md:inline">(Ctrl+B)</span>
              </Button>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-end gap-2">
                  <div className={cn(
                    "flex items-center gap-2 text-lg font-medium px-3 py-2 rounded-lg border-2 transition-all",
                    getTimerColor(timeLeft, exam.perQuestionTimer ? (exam.questions[currentQuestionIndex]?.timeLimit || 60) : (exam.timeLimit || 30) * 60),
                    getTimerBgColor(timeLeft, exam.perQuestionTimer ? (exam.questions[currentQuestionIndex]?.timeLimit || 60) : (exam.timeLimit || 30) * 60)
                  )}>
                      <Timer className="h-6 w-6" />
                      <span>{formatTime(timeLeft)}</span>
                  </div>
                  {lastSaved && (
                    <div className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      <Save className="h-3 w-3" />
                      <span>Auto-saved {lastSaved.toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={isSubmitting || !hasCameraPermission}>Submit Exam</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. You will not be able to change your answers after submitting.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={submitExam} disabled={isSubmitting}>
                                {isSubmitting ? 'Submitting...' : 'Yes, submit my exam'}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
            </CardHeader>
            <CardContent className="pt-6">
            
            {(!currentQuestion.type || currentQuestion.type === 'mcq') ? (
              <>
                <h2 className="text-xl md:text-2xl font-semibold mb-6">{currentQuestion.questionText}</h2>
                <RadioGroup 
                    className="space-y-4"
                    onValueChange={(value) => {
                        const newAnswers = [...answers];
                        newAnswers[currentQuestionIndex] = value;
                        setAnswers(newAnswers);
                    }}
                    value={answers[currentQuestionIndex] || ''}
                    disabled={!hasCameraPermission || isSubmitting}
                >
                    {currentQuestion.options?.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2 p-4 border rounded-lg transition-colors has-[:checked]:bg-primary/10 has-[:checked]:border-primary">
                        <RadioGroupItem value={option} id={`option-${index}`} />
                        <Label htmlFor={`option-${index}`} className="text-base w-full cursor-pointer">{option}</Label>
                    </div>
                    ))}
                </RadioGroup>
              </>
            ) : (
              <PanelGroup direction="horizontal" orientation="horizontal" className="min-h-[75vh] max-h-[75vh] rounded-lg border w-full overflow-hidden" key="layout-outer-horizontal">
                <Panel defaultSize={40} minSize={20} className="space-y-4 overflow-y-auto p-4 bg-background">
                  <h2 className="text-xl font-bold">{currentQuestion.questionText}</h2>
                  <div className="prose prose-sm dark:prose-invert">
                    <p className="whitespace-pre-wrap">{currentQuestion.problemStatement}</p>
                  </div>
                  <div className="space-y-2 mt-4">
                    <h3 className="font-semibold text-sm">Sample Input:</h3>
                    <pre className="bg-muted p-2 rounded-md text-xs whitespace-pre-wrap font-mono">{currentQuestion.sampleInput || 'None'}</pre>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Expected Output:</h3>
                    <pre className="bg-muted p-2 rounded-md text-xs whitespace-pre-wrap font-mono">{currentQuestion.sampleOutput || 'None'}</pre>
                  </div>
                </Panel>
                <PanelResizeHandle className="w-2 bg-muted hover:bg-brand-primary/20 transition-colors cursor-col-resize flex flex-col items-center justify-center">
                  <div className="h-8 w-1 bg-muted-foreground/30 rounded-full" />
                </PanelResizeHandle>
                <Panel defaultSize={60} minSize={30} className="flex flex-col bg-background">
                  <div className="bg-muted p-2 flex justify-between items-center border-b">
                    <select 
                      className="bg-background text-sm border rounded px-2 py-1"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(Number(e.target.value))}
                    >
                      <option value={63}>JavaScript (Node.js)</option>
                      <option value={71}>Python (3.8.1)</option>
                      <option value={54}>C++ (GCC 9.2.0)</option>
                      <option value={62}>Java (OpenJDK 13.0.1)</option>
                    </select>
                    <Button size="sm" onClick={runCode} disabled={isExecuting || !hasCameraPermission}>
                      <Play className="h-4 w-4 mr-1" />
                      {isExecuting ? 'Running...' : 'Run Code'}
                    </Button>
                  </div>
                  <PanelGroup direction="vertical" orientation="vertical" className="flex-1 w-full" key="layout-inner-vertical">
                    <Panel defaultSize={testCaseResults ? 55 : 100} minSize={20} className="flex flex-col">
                      <div className="flex-1 h-full">
                        <Editor
                          height="100%"
                          defaultLanguage="javascript"
                          language={selectedLanguage === 63 ? 'javascript' : selectedLanguage === 71 ? 'python' : selectedLanguage === 54 ? 'cpp' : 'java'}
                          theme="vs-dark"
                          value={answers[currentQuestionIndex] || currentQuestion.starterCode || ''}
                          onChange={(value) => {
                            const newAnswers = [...answers];
                            newAnswers[currentQuestionIndex] = value || '';
                            setAnswers(newAnswers);
                          }}
                          options={{ minimap: { enabled: false }, fontSize: 14 }}
                        />
                      </div>
                    </Panel>
                    {testCaseResults && (
                      <>
                        <PanelResizeHandle className="h-2 bg-muted hover:bg-brand-primary/20 transition-colors cursor-row-resize flex items-center justify-center">
                          <div className="w-8 h-1 bg-muted-foreground/30 rounded-full" />
                        </PanelResizeHandle>
                        <Panel defaultSize={45} minSize={20} className="bg-[#1a1a1a] dark:bg-[#1a1a1a] text-white flex flex-col">
                          <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
                            {/* Overall Status */}
                            <div className="flex items-center gap-4">
                              <h3 className={cn("text-2xl font-bold tracking-tight", testCaseResults.every(r => r.passed) ? "text-green-500" : "text-red-500")}>
                                {testCaseResults.every(r => r.passed) ? "Accepted" : "Wrong Answer"}
                              </h3>
                            </div>

                            {/* Test Case Tabs */}
                            <div className="flex flex-wrap gap-2">
                              {testCaseResults.map((tc, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setSelectedTestCase(idx)}
                                  className={cn(
                                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200",
                                    selectedTestCase === idx 
                                      ? "bg-[#333333] text-white" 
                                      : "hover:bg-[#2a2a2a] text-gray-400"
                                  )}
                                >
                                  <div className={cn("w-1.5 h-1.5 rounded-full", tc.passed ? "bg-green-500" : "bg-red-500")} />
                                  Case {idx + 1}
                                </button>
                              ))}
                            </div>

                            {/* Selected Test Case Details */}
                            {testCaseResults[selectedTestCase] && (
                              <div className="flex flex-col gap-5 mt-2">
                                <div>
                                  <div className="text-sm font-semibold text-gray-400 mb-2">Input</div>
                                  <div className="bg-[#2a2a2a] border border-[#333333] rounded-lg p-3 font-mono text-sm whitespace-pre-wrap text-gray-200">
                                    {testCaseResults[selectedTestCase].input || '(empty)'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-gray-400 mb-2">Output</div>
                                  <div className="bg-[#2a2a2a] border border-[#333333] rounded-lg p-3 font-mono text-sm whitespace-pre-wrap text-gray-200">
                                    {testCaseResults[selectedTestCase].actualOutput || '(empty)'}
                                  </div>
                                </div>
                                {!testCaseResults[selectedTestCase].passed && testCaseResults[selectedTestCase].expectedOutput && (
                                  <div>
                                    <div className="text-sm font-semibold text-gray-400 mb-2">Expected</div>
                                    <div className="bg-[#2a2a2a] border border-[#333333] rounded-lg p-3 font-mono text-sm whitespace-pre-wrap text-gray-200">
                                      {testCaseResults[selectedTestCase].expectedOutput}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </Panel>
                      </>
                    )}
                  </PanelGroup>
                </Panel>
              </PanelGroup>
            )}
            </CardContent>
             <CardFooter className="flex justify-between border-t pt-4">
                <Button onClick={handlePrev} disabled={currentQuestionIndex === 0 || isSubmitting}>
                    Previous
                </Button>
                {currentQuestionIndex < exam.questions.length - 1 ? (
                    <Button onClick={handleNext} disabled={isSubmitting || !hasCameraPermission}>
                        Next Question
                    </Button>
                ) : (
                     <Button onClick={submitExam} disabled={isSubmitting || !hasCameraPermission}>
                        {isSubmitting ? 'Submitting...' : 'Finish & Submit'}
                    </Button>
                )}
            </CardFooter>
        </Card>

         <Card className="w-full z-10 order-1 lg:order-2">
            <CardHeader>
                <CardTitle>Question Palette</CardTitle>
                <div className="text-xs text-brand-primary/70 font-medium">
                  ⚡ ProctorLink Proctoring
                </div>
            </CardHeader>
            <CardContent className="grid grid-cols-5 gap-2">
                {exam.questions.map((_, index) => (
                    <Button
                        key={index}
                        variant={currentQuestionIndex === index ? 'default' : (answers[index] ? 'secondary' : 'outline')}
                        className={cn(
                          "h-10 w-10 p-0 relative",
                          answers[index] && "border-green-500",
                          bookmarkedQuestions.has(index) && "ring-2 ring-yellow-400"
                        )}
                        onClick={() => goToQuestion(index)}
                    >
                        {answers[index] ? <CheckCircle className="h-5 w-5" /> : index + 1}
                        {bookmarkedQuestions.has(index) && (
                          <Bookmark className="absolute -top-1 -right-1 h-3 w-3 text-yellow-600 fill-yellow-600" />
                        )}
                    </Button>
                ))}
            </CardContent>
             <CardFooter className="flex-col gap-2 items-start text-sm text-muted-foreground">
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-secondary border border-green-500"></div> Answered</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border"></div> Unanswered</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">#</div> Current</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border ring-2 ring-yellow-400 relative"><Bookmark className="absolute -top-1 -right-1 h-2 w-2 text-yellow-600 fill-yellow-600" /></div> Bookmarked</div>
                <div className="flex flex-col gap-2 mt-2 w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Bookmarked: {bookmarkedQuestions.size}</span>
                  </div>
                  {bookmarkedQuestions.size > 0 && (
                    <Button
                      onClick={() => {
                        const bookmarkedArray = Array.from(bookmarkedQuestions).sort((a, b) => a - b);
                        const currentBookmarkIndex = bookmarkedArray.indexOf(currentQuestionIndex);
                        const nextBookmark = currentBookmarkIndex >= 0 && currentBookmarkIndex < bookmarkedArray.length - 1
                          ? bookmarkedArray[currentBookmarkIndex + 1]
                          : bookmarkedArray[0];
                        goToQuestion(nextBookmark);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full text-xs flex items-center gap-1"
                    >
                      <Bookmark className="h-3 w-3" />
                      Review Bookmarked
                    </Button>
                  )}
                </div>
                 <div className="flex items-center gap-2 mt-4 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    <span>{warningCount} Warnings</span>
                </div>
             </CardFooter>
        </Card>
      </div>


      {/* Proctor Camera - Top Right Corner */}
      <div className="fixed top-4 right-4 z-20">
        <div className="relative w-32 h-24 md:w-48 md:h-36 rounded-lg overflow-hidden border-2 border-brand-primary shadow-xl bg-gray-900 transition-all hover:scale-105">
           <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
           <div className="absolute top-1 left-1 md:top-2 md:left-2 bg-black/80 text-white px-1 md:px-2 py-0.5 md:py-1 rounded text-xs font-medium flex items-center gap-1">
             <Camera className="h-2 w-2 md:h-3 md:w-3" />
             <span className="hidden md:inline">{hasCameraPermission ? 'PROCTOR ON' : 'CAMERA OFF'}</span>
             <span className="md:hidden">{hasCameraPermission ? 'ON' : 'OFF'}</span>
           </div>
           {/* ProctorLink Branding */}
           <div className="absolute bottom-1 left-1 md:bottom-2 md:left-2 bg-black/70 text-white px-1 rounded text-xs">
             <div className="flex items-center gap-1">
               <GraduationCap className="h-2 w-2 md:h-3 md:w-3" />
               <span className="hidden md:inline text-xs">ProctorLink</span>
             </div>
             <div className="text-xs text-gray-300 hidden md:block" style={{fontSize: '8px'}}>ProctorLink</div>
           </div>
           {/* Status indicator */}
           <div className="absolute top-1 right-1 md:top-2 md:right-2">
             <div className={`w-2 h-2 rounded-full ${hasCameraPermission ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
           </div>
           {/* Recording indicator when camera is active */}
           {hasCameraPermission && (
             <div className="absolute bottom-1 right-1 md:bottom-2 md:right-2 bg-red-500 text-white text-xs px-1 rounded flex items-center gap-1">
               <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>
               <span className="text-xs">REC</span>
             </div>
           )}
        </div>
      </div>

       <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> Proctoring Warning</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogMessage}
            </AlertDialogDescription>
            <div className="text-xs text-brand-primary/70 font-medium bg-brand-light/10 px-2 py-1 rounded mt-2">
              🛡️ ProctorLink Security System
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowWarningDialog(false)}>I Understand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
