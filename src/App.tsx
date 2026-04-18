import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Bell, BookOpen, Plus, Trash2, CheckCircle2, Circle, Settings, X, Pencil, Check, GripVertical, Target, Calendar, Clock, AlertCircle, BellOff, LogIn, LogOut, User, Heart, Users, Briefcase, Home, Globe, Star, Sun, Shield, Book, Music, Coffee, Folder, Share2, Moon, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Reorder } from 'motion/react';
import { auth, db, googleProvider, outlookProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// --- Types ---
type Frequency = 'daily' | 'weekly';

type PrayerItem = {
  id: string;
  text: string;
  checked: boolean;
  startDate?: string;
};

type Topic = {
  id: string;
  title: string;
  icon?: string;
  items: PrayerItem[];
};

type PrayerVow = {
  active: boolean;
  startDate: string;
  totalDays: number;
  minutesPerDay: number;
  motives: string;
  daysCompleted: number;
  lastCompletedDate: string | null;
};

// --- Data ---
const AVAILABLE_ICONS: Record<string, React.ElementType> = {
  Heart, Users, Briefcase, Home, Globe, Star, Sun, Shield, Book, Music, Coffee, Folder
};

const VERSES = [
  { text: "Orad sin cesar.", ref: "1 Tesalonicenses 5:17" },
  { text: "Con toda oración y petición orando en todo tiempo en el espíritu, y para ello velando con toda perseverancia y petición por todos los santos", ref: "Efesios 6:18" },
  { text: "Perseverad en la oración, velando en ella con acción de gracias", ref: "Colosenses 4:2" },
  { text: "Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias", ref: "Filipenses 4:6" },
  { text: "Gozaos en la esperanza; soportad en la tribulación; perseverad en la oración", ref: "Romanos 12:12" },
  { text: "Velad y orad, para que no entréis en tentación; el espíritu a la verdad está dispuesto, pero la carne es débil.", ref: "Mateo 26:41" },
  { text: "Exhorto, pues, ante todo, que se hagan peticiones, oraciones, intercesiones y acciones de gracias por todos los hombres", ref: "1 Timoteo 2:1" }
];

const DEFAULT_TOPICS: Topic[] = [
  {
    id: '1',
    title: 'Hermanos de la iglesia',
    icon: 'Users',
    items: [
      { id: '1-1', text: 'Hermano Juan', checked: false },
      { id: '1-2', text: 'Hermano Pedro', checked: false },
    ]
  },
  {
    id: '2',
    title: 'Familia',
    icon: 'Home',
    items: []
  },
  {
    id: '3',
    title: 'Carga personal',
    icon: 'Heart',
    items: []
  }
];

export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginProvider, setLoginProvider] = useState<'google' | 'outlook' | null>(null);

  // --- State ---
  const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
  const [lastResetDate, setLastResetDate] = useState<string>(new Date().toDateString());
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState<{ active: boolean; currentIndex: number; timer: number; isRunning: boolean }>({ active: false, currentIndex: 0, timer: 0, isRunning: false });
  const [reminderTime, setReminderTime] = useState<string>('08:00');
  const [lastNotifiedDate, setLastNotifiedDate] = useState<string>('');
  const [reminderFrequency, setReminderFrequency] = useState<Frequency>('daily');
  const [reminderDays, setReminderDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [mutedUntil, setMutedUntil] = useState<number | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [vow, setVow] = useState<PrayerVow>({ active: false, startDate: '', totalDays: 7, minutesPerDay: 15, motives: '', daysCompleted: 0, lastCompletedDate: null });
  const [history, setHistory] = useState<any[]>([]);
  const [vowForm, setVowForm] = useState({ totalDays: 7, minutesPerDay: 15, motives: '' });
  
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicIcon, setNewTopicIcon] = useState<string>('Folder');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');

  const [activeReminder, setActiveReminder] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const lastSyncData = useRef<string>('');
  const isInitialLoad = useRef<boolean>(true);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Random verse for the day/session
  const dailyVerse = useMemo(() => {
    const index = Math.floor(Math.random() * VERSES.length);
    return VERSES[index];
  }, []);

  // --- Effects ---

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
      if (!firebaseUser) {
        // Load from local storage if not logged in
        const savedTopics = localStorage.getItem('prayer-topics');
        if (savedTopics) setTopics(JSON.parse(savedTopics));
        const savedSettings = localStorage.getItem('prayer-notifications');
        if (savedSettings) setNotificationsEnabled(savedSettings === 'true');
        const savedDarkMode = localStorage.getItem('prayer-dark-mode');
        if (savedDarkMode) setDarkMode(savedDarkMode === 'true');
        const savedVow = localStorage.getItem('prayer-vow');
        if (savedVow) setVow(JSON.parse(savedVow));
      }
    });

    const installHandler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', installHandler);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', installHandler);
    };
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user) {
      isInitialLoad.current = true;
      lastSyncData.current = '';
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && !docSnap.metadata.hasPendingWrites) {
        const data = docSnap.data();
        const settings = data.settings || {};
        
        const serverState = {
          topics: data.topics || DEFAULT_TOPICS,
          vow: data.vow || { active: false, startDate: '', totalDays: 7, minutesPerDay: 15, motives: '', daysCompleted: 0, lastCompletedDate: null },
          history: data.history || [],
          lastResetDate: data.lastResetDate || new Date().toDateString(),
          notificationsEnabled: settings.notificationsEnabled || false,
          reminderTime: settings.reminderTime || '08:00',
          reminderFrequency: settings.reminderFrequency || 'daily',
          reminderDays: settings.reminderDays || [0, 1, 2, 3, 4, 5, 6],
          mutedUntil: settings.mutedUntil || null,
          darkMode: settings.darkMode || false
        };

        const serverJson = JSON.stringify(serverState);
        
        // Prevent loop and unnecessary state updates
        if (serverJson !== lastSyncData.current) {
          setTopics(serverState.topics);
          setVow(serverState.vow);
          setLastResetDate(serverState.lastResetDate);
          setHistory(serverState.history);
          setNotificationsEnabled(serverState.notificationsEnabled);
          setReminderTime(serverState.reminderTime);
          setReminderFrequency(serverState.reminderFrequency);
          setReminderDays(serverState.reminderDays);
          setMutedUntil(serverState.mutedUntil);
          setDarkMode(serverState.darkMode);
          
          lastSyncData.current = serverJson;
        }
      } else if (!docSnap.exists() && isInitialLoad.current) {
        // Doc doesn't exist and it's our first check: upload current state (guest data)
        saveToFirestore();
      }
      isInitialLoad.current = false;
    });

    return () => unsubscribe();
  }, [user]);

  const saveToFirestore = async () => {
    if (!user) return;
    
    const currentState = {
      topics,
      vow,
      history,
      lastResetDate,
      settings: {
        notificationsEnabled,
        reminderTime,
        reminderFrequency,
        reminderDays,
        mutedUntil,
        darkMode
      }
    };

    const currentJson = JSON.stringify(currentState);
    if (currentJson === lastSyncData.current) return;

    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...currentState,
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      lastSyncData.current = currentJson;
    } catch (error) {
      console.error("Error saving to Firestore:", error);
    }
  };

  // Sync state to persistence (localStorage or Firestore)
  useEffect(() => {
    if (!user) {
      localStorage.setItem('prayer-topics', JSON.stringify(topics));
      localStorage.setItem('prayer-notifications', String(notificationsEnabled));
      localStorage.setItem('prayer-vow', JSON.stringify(vow));
      localStorage.setItem('prayer-history', JSON.stringify(history));
      localStorage.setItem('prayer-reminder-time', reminderTime);
      localStorage.setItem('prayer-reminder-freq', reminderFrequency);
      localStorage.setItem('prayer-reminder-days', JSON.stringify(reminderDays));
      localStorage.setItem('prayer-dark-mode', String(darkMode));
      localStorage.setItem('prayer-last-reset', lastResetDate);
      if (mutedUntil) localStorage.setItem('prayer-muted-until', mutedUntil.toString());
      else localStorage.removeItem('prayer-muted-until');
    } else {
      // Debounced save for authenticated users
      const timeoutId = setTimeout(() => {
        saveToFirestore();
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [topics, notificationsEnabled, vow, history, reminderTime, reminderFrequency, reminderDays, mutedUntil, darkMode, lastResetDate, user]);

  // Apply dark mode class to html
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auto-reset checkboxes daily
  useEffect(() => {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
      // Save current progress to history before resetting
      const completedItems = topics.flatMap(t => t.items.filter(i => i.checked).map(i => i.text));
      if (completedItems.length > 0) {
        setHistory(prev => [{ date: lastResetDate, items: completedItems }, ...prev].slice(0, 30)); // Keep last 30 days
      }

      setTopics(prevTopics => 
        prevTopics.map(topic => ({
          ...topic,
          items: topic.items.map(item => ({ ...item, checked: false }))
        }))
      );
      setLastResetDate(today);
      if (!user) {
        localStorage.setItem('prayer-last-reset', today);
        localStorage.setItem('prayer-history', JSON.stringify([{ date: lastResetDate, items: completedItems }, ...history].slice(0, 30)));
      }
    }
  }, [lastResetDate, user, topics]);

  // Notifications Logic
  useEffect(() => {
    if (!notificationsEnabled) return;

    // Request permission if not granted, but don't disable if denied (we'll use in-app)
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission().catch(() => {});
    }

    const checkAndNotify = () => {
      if (mutedUntil && Date.now() < mutedUntil) return; // Muted

      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;
      const today = now.toDateString();
      const currentDay = now.getDay();

      if (currentTime === reminderTime && lastNotifiedDate !== today) {
        if (reminderFrequency === 'daily' || (reminderFrequency === 'weekly' && reminderDays.includes(currentDay))) {
          // Trigger in-app reminder
          setActiveReminder(true);
          setLastNotifiedDate(today);

          // Try native notification if allowed
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification('Tiempo de Orar', {
                    body: 'Perseverad en la oración, velando en ella con acción de gracias.',
                    icon: 'https://picsum.photos/seed/prayer/192/192',
                    badge: 'https://picsum.photos/seed/prayer/192/192',
                    vibrate: [100, 50, 100],
                  } as any);
                });
              } else {
                new Notification('Tiempo de Orar', {
                  body: 'Perseverad en la oración, velando en ella con acción de gracias.',
                  icon: 'https://picsum.photos/seed/prayer/192/192'
                });
              }
            } catch (e) {
              // Ignore native error
            }
          }
        }
      }
    };

    // Check immediately
    checkAndNotify();

    // Then check every minute
    const interval = setInterval(checkAndNotify, 60000);
    return () => clearInterval(interval);
  }, [notificationsEnabled, reminderTime, lastNotifiedDate, reminderFrequency, reminderDays, mutedUntil]);

  // Focus Mode Timer
  useEffect(() => {
    let interval: any;
    if (focusMode.active && focusMode.isRunning) {
      interval = setInterval(() => {
        setFocusMode(prev => ({ ...prev, timer: prev.timer + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [focusMode.active, focusMode.isRunning]);

  // --- Handlers ---

  const startFocusMode = () => {
    const allItems = topics.flatMap(t => t.items.map(i => ({ ...i, topicTitle: t.title })));
    if (allItems.length === 0) {
      showToast("Agrega algunos motivos de oración primero");
      return;
    }
    setFocusMode({ active: true, currentIndex: 0, timer: 0, isRunning: true });
  };

  const nextFocusItem = () => {
    const allItems = topics.flatMap(t => t.items);
    setFocusMode(prev => ({
      ...prev,
      currentIndex: (prev.currentIndex + 1) % allItems.length
    }));
  };

  const prevFocusItem = () => {
    const allItems = topics.flatMap(t => t.items);
    setFocusMode(prev => ({
      ...prev,
      currentIndex: (prev.currentIndex - 1 + allItems.length) % allItems.length
    }));
  };

  const toggleFocusTimer = () => {
    setFocusMode(prev => ({ ...prev, isRunning: !prev.isRunning }));
  };

  const exitFocusMode = () => {
    setFocusMode({ active: false, currentIndex: 0, timer: 0, isRunning: false });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const toggleItemInFocus = (itemId: string) => {
    setTopics(prev => prev.map(t => ({
      ...t,
      items: t.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i)
    })));
  };
  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      setNotificationsEnabled(true);
      if ('Notification' in window) {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            showToast(`Recordatorios activados para las ${reminderTime}.`);
          } else {
            showToast('Notificaciones nativas bloqueadas. Usaremos recordatorios dentro de la app.');
          }
        } catch (e) {
          showToast('Usaremos recordatorios dentro de la app.');
        }
      } else {
        showToast('Navegador no soporta notificaciones web. Usaremos recordatorios en la app.');
      }
    } else {
      setNotificationsEnabled(false);
      showToast('Recordatorios desactivados.');
    }
  };

  const saveSettings = () => {
    setIsSettingsOpen(false);
    saveToFirestore();
    showToast('Configuración guardada');
  };

  const muteForHours = (hours: number) => {
    setMutedUntil(Date.now() + hours * 60 * 60 * 1000);
    showToast(`Notificaciones silenciadas por ${hours} hora${hours > 1 ? 's' : ''}`);
  };

  const muteUntilTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    setMutedUntil(tomorrow.getTime());
    showToast('Notificaciones silenciadas hasta mañana');
  };

  const unmute = () => {
    setMutedUntil(null);
    showToast('Notificaciones reactivadas');
  };

  const loginWithGoogle = async () => {
    if (loginProvider) return;
    setLoginProvider('google');
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Sesión iniciada con Google');
    } catch (error: any) {
      console.error('Error de login con Google:', error);
      if (error.code === 'auth/unauthorized-domain') {
        showToast('Error: Dominio no autorizado en Firebase Console.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore
      } else if (error.code === 'auth/popup-closed-by-user') {
        showToast('Inicio de sesión cancelado');
      } else {
        showToast('Error al iniciar sesión con Google');
      }
    } finally {
      setLoginProvider(null);
    }
  };

  const loginWithOutlook = async () => {
    if (loginProvider) return;
    setLoginProvider('outlook');
    try {
      await signInWithPopup(auth, outlookProvider);
      showToast('Sesión iniciada con Outlook');
    } catch (error: any) {
      console.error('Error de login con Outlook:', error);
      if (error.code === 'auth/unauthorized-domain') {
        showToast('Error: Dominio no autorizado en Firebase Console.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore
      } else if (error.code === 'auth/popup-closed-by-user') {
        showToast('Inicio de sesión cancelado');
      } else {
        showToast('Error al iniciar sesión con Outlook');
      }
    } finally {
      setLoginProvider(null);
    }
  };

  const logout = async () => {
    try {
      if (user) {
        await saveToFirestore();
      }
      await signOut(auth);
      showToast('Sesión cerrada');
    } catch (error) {
      showToast('Error al cerrar sesión');
    }
  };

  const installPWA = () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('¡Gracias por instalar la aplicación!');
      }
      setDeferredPrompt(null);
    });
  };

  const addTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;
    
    const newTopic: Topic = {
      id: Date.now().toString(),
      title: newTopicTitle.trim(),
      icon: newTopicIcon,
      items: []
    };
    
    setTopics([...topics, newTopic]);
    setNewTopicTitle('');
    setNewTopicIcon('Folder');
  };

  const deleteTopic = (topicId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar tema',
      message: '¿Estás seguro de eliminar este tema y todos sus motivos?',
      onConfirm: () => {
        setTopics(topics.filter(t => t.id !== topicId));
        showToast('Tema eliminado');
      }
    });
  };

  const addItem = (topicId: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newItemTexts[topicId];
    if (!text?.trim()) return;

    setTopics(topics.map(topic => {
      if (topic.id === topicId) {
        return {
          ...topic,
          items: [...topic.items, { 
            id: Date.now().toString(), 
            text: text.trim(), 
            checked: false,
            startDate: new Date().toISOString().split('T')[0]
          }]
        };
      }
      return topic;
    }));

    setNewItemTexts({ ...newItemTexts, [topicId]: '' });
  };

  const deleteItem = (topicId: string, itemId: string) => {
    setTopics(topics.map(topic => {
      if (topic.id === topicId) {
        return {
          ...topic,
          items: topic.items.filter(item => item.id !== itemId)
        };
      }
      return topic;
    }));
  };

  const startEditing = (item: PrayerItem) => {
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };

  const saveEdit = (topicId: string) => {
    if (!editingItemId || !editingItemText.trim()) return;
    
    setTopics(topics.map(topic => {
      if (topic.id === topicId) {
        return {
          ...topic,
          items: topic.items.map(item => 
            item.id === editingItemId ? { ...item, text: editingItemText.trim() } : item
          )
        };
      }
      return topic;
    }));
    
    setEditingItemId(null);
    setEditingItemText('');
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditingItemText('');
  };

  const handleShare = async (title: string, text: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
        });
        showToast('Compartido con éxito');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          fallbackShare(text);
        }
      }
    } else {
      fallbackShare(text);
    }
  };

  const fallbackShare = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copiado al portapapeles');
    }).catch(() => {
      showToast('Error al compartir');
    });
  };

  const shareTopic = (topic: Topic) => {
    const title = `Motivos de oración: ${topic.title}`;
    const itemsText = topic.items.length > 0
      ? topic.items.map(item => `• ${item.text}`).join('\n')
      : 'Aún no hay motivos específicos.';
    const text = `🙏 Te comparto mis motivos de oración sobre "${topic.title}":\n\n${itemsText}\n\n¡Acompáñame en oración!`;
    handleShare(title, text);
  };

  const shareItem = (topicTitle: string, item: PrayerItem) => {
    const title = 'Motivo de oración';
    const text = `🙏 Acompáñame a orar por este motivo (${topicTitle}):\n\n"${item.text}"`;
    handleShare(title, text);
  };

  const toggleItemCheck = (topicId: string, itemId: string) => {
    setTopics(topics.map(topic => {
      if (topic.id === topicId) {
        return {
          ...topic,
          items: topic.items.map(item => 
            item.id === itemId ? { ...item, checked: !item.checked } : item
          )
        };
      }
      return topic;
    }));
  };

  const reorderItems = (topicId: string, newItems: PrayerItem[]) => {
    setTopics(topics.map(topic => {
      if (topic.id === topicId) {
        return { ...topic, items: newItems };
      }
      return topic;
    }));
  };

  // Vow Handlers
  const startVow = (e: React.FormEvent) => {
    e.preventDefault();
    setVow({
      active: true,
      startDate: new Date().toDateString(),
      totalDays: vowForm.totalDays,
      minutesPerDay: vowForm.minutesPerDay,
      motives: vowForm.motives,
      daysCompleted: 0,
      lastCompletedDate: null
    });
    showToast('Voto de oración iniciado');
  };

  const completeVowDay = () => {
    const today = new Date().toDateString();
    if (vow.lastCompletedDate === today) return;
    
    const newCompleted = vow.daysCompleted + 1;
    if (newCompleted >= vow.totalDays) {
      showToast('¡Felicidades! Has completado tu voto de oración.');
      setVow({ ...vow, active: false, daysCompleted: newCompleted, lastCompletedDate: today });
    } else {
      setVow({ ...vow, daysCompleted: newCompleted, lastCompletedDate: today });
      showToast(`Día ${newCompleted} completado. ¡Sigue así!`);
    }
  };

  const cancelVow = () => {
    setVow({ ...vow, active: false });
    showToast('Voto cancelado');
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Diario de Oración</h1>
          <p className="text-slate-600 dark:text-slate-300 mb-8">Debes iniciar sesión para que tus datos, configuraciones e historial queden guardados de forma segura.</p>
          
          <div className="space-y-3">
            <button 
              onClick={loginWithGoogle} 
              disabled={loginProvider !== null}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginProvider === 'google' ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
              ) : (
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
              )}
              {loginProvider === 'google' ? 'Iniciando sesión...' : 'Continuar con Google'}
            </button>
            <button 
              onClick={loginWithOutlook} 
              disabled={loginProvider !== null}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginProvider === 'outlook' ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
              ) : (
                <img src="https://www.microsoft.com/favicon.ico" className="w-5 h-5" alt="Outlook" />
              )}
              {loginProvider === 'outlook' ? 'Iniciando sesión...' : 'Continuar con Outlook / Hotmail'}
            </button>
          </div>
        </div>
        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white px-6 py-3 rounded-full shadow-lg text-sm font-medium z-50">
            {toast}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans selection:bg-blue-100 dark:selection:bg-blue-900/50">
      {/* Header / Hero Section */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-50 dark:bg-blue-900/50 p-2 rounded-lg text-blue-600 dark:text-blue-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Diario de Oración</h1>
          </div>
          <div className="flex items-center space-x-2">
            {deferredPrompt && (
              <button
                onClick={installPWA}
                className="hidden sm:flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Instalar App</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-medium text-slate-900 dark:text-slate-200">{user.displayName}</span>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
            <button
              onClick={startFocusMode}
              className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              title="Modo Enfoque"
            >
              <Target className="w-4 h-4" />
              <span className="hidden min-[400px]:inline">Enfoque</span>
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              title={darkMode ? "Modo Claro" : "Modo Oscuro"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              title="Configuración"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              className="p-2 text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        
        {/* Verse of the Day */}
        <section className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg p-6 sm:p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <h2 className="text-blue-100 text-sm font-medium tracking-wider uppercase mb-3 flex items-center">
              <BookOpen className="w-4 h-4 mr-2" />
              Palabra de Aliento
            </h2>
            <blockquote className="text-xl sm:text-2xl font-medium leading-relaxed mb-4">
              "{dailyVerse.text}"
            </blockquote>
            <cite className="text-blue-200 font-medium not-italic">
              — {dailyVerse.ref} (Versión Recobro)
            </cite>
          </div>
        </section>

        {/* Topics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {topics.map(topic => (
            <div key={topic.id} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
              <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white dark:bg-slate-700 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 text-blue-500 dark:text-blue-400">
                    {topic.icon && AVAILABLE_ICONS[topic.icon] 
                      ? React.createElement(AVAILABLE_ICONS[topic.icon], { className: "w-5 h-5" }) 
                      : <Folder className="w-5 h-5" />}
                  </div>
                  <h3 className="font-semibold text-lg sm:text-xl text-slate-800 dark:text-white">{topic.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => shareTopic(topic)}
                    className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-white dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 rounded-md shadow-sm border border-slate-200 dark:border-slate-600"
                    title="Compartir tema"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteTopic(topic.id)}
                    className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors bg-white dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-slate-600 rounded-md shadow-sm border border-slate-200 dark:border-slate-600"
                    title="Eliminar tema"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="p-5 flex-1 flex flex-col">
                {topic.items.length === 0 ? (
                  <div className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4 mb-4">
                    No hay motivos en este tema aún.
                  </div>
                ) : (
                  <Reorder.Group
                    axis="y"
                    values={topic.items}
                    onReorder={(newItems) => reorderItems(topic.id, newItems)}
                    className="space-y-3 flex-1 mb-4"
                  >
                    {topic.items.map(item => (
                      <Reorder.Item
                        key={item.id}
                        value={item}
                        className="flex items-center group min-h-[44px] py-1 border-b border-slate-50 dark:border-slate-700/50 last:border-0 bg-white dark:bg-slate-800"
                      >
                        {editingItemId === item.id ? (
                          <div className="flex-1 flex items-center gap-2 w-full">
                            <input
                              type="text"
                              value={editingItemText}
                              onChange={(e) => setEditingItemText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit(topic.id);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              className="flex-1 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                              autoFocus
                            />
                            <button onClick={() => saveEdit(topic.id)} className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 p-2 bg-green-50 dark:bg-green-900/30 rounded-md">
                              <Check className="w-5 h-5" />
                            </button>
                            <button onClick={cancelEdit} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 bg-slate-100 dark:bg-slate-700 rounded-md">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="cursor-grab active:cursor-grabbing p-1 text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500 mr-1">
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <button
                              onClick={() => toggleItemCheck(topic.id, item.id)}
                              className="flex-shrink-0 p-1 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none transition-colors"
                            >
                              {item.checked ? (
                                <CheckCircle2 className="w-6 h-6 text-green-500 dark:text-green-400" />
                              ) : (
                                <Circle className="w-6 h-6" />
                              )}
                            </button>
                            <div className="ml-3 flex-1 flex flex-col justify-center">
                              <span className={`text-base transition-all ${item.checked ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                                {item.text}
                              </span>
                              {item.startDate && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Calendar className="w-3 h-3" />
                                  Desde: {new Date(item.startDate + 'T12:00:00').toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center ml-2 space-x-1">
                              <button
                                onClick={() => shareItem(topic.title, item)}
                                className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-slate-50 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 rounded-md"
                                title="Compartir motivo"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => startEditing(item)}
                                className="p-2 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md"
                                title="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteItem(topic.id, item.id)}
                                className="p-2 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md"
                                title="Eliminar"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </>
                        )}
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                )}

                <form onSubmit={(e) => addItem(topic.id, e)} className="mt-auto relative">
                  <input
                    type="text"
                    value={newItemTexts[topic.id] || ''}
                    onChange={(e) => setNewItemTexts({ ...newItemTexts, [topic.id]: e.target.value })}
                    placeholder="Añadir motivo o nombre..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-4 pr-12 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!newItemTexts[topic.id]?.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 dark:text-blue-400 disabled:text-slate-300 dark:disabled:text-slate-600 hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-white dark:bg-slate-800 rounded-md shadow-sm border border-slate-100 dark:border-slate-700 disabled:bg-transparent disabled:border-transparent disabled:shadow-none"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          ))}

          {/* Add New Topic Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 flex flex-col items-center justify-center text-center min-h-[250px]">
            <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full shadow-sm flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-medium text-slate-800 dark:text-white mb-2">Crear nuevo tema</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Añade una nueva categoría para organizar tus oraciones.</p>
            <form onSubmit={addTopic} className="w-full max-w-xs flex flex-col gap-4">
              <div className="flex gap-2 overflow-x-auto pb-2 justify-start sm:justify-center px-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                {Object.keys(AVAILABLE_ICONS).map(iconName => {
                  const IconComponent = AVAILABLE_ICONS[iconName];
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setNewTopicIcon(iconName)}
                      className={`p-2 rounded-xl flex-shrink-0 transition-colors ${newTopicIcon === iconName ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-200 dark:border-blue-800' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent'}`}
                      title={iconName}
                    >
                      <IconComponent className="w-5 h-5" />
                    </button>
                  )
                })}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  placeholder="Ej. Trabajo, Viajes..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-4 pr-12 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!newTopicTitle.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 dark:text-blue-400 disabled:text-slate-300 dark:disabled:text-slate-600 hover:text-blue-700 dark:hover:text-blue-300 transition-colors bg-slate-50 dark:bg-slate-800 rounded-md disabled:bg-transparent"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Voto de Oración Section */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              Voto de Oración
            </h2>
          </div>
          {!vow.active ? (
            <form onSubmit={startVow} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">Consagra un tiempo específico diario para orar por motivos especiales.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Días consagrados</label>
                  <input type="number" min="1" value={vowForm.totalDays} onChange={e => setVowForm({...vowForm, totalDays: parseInt(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Minutos por día</label>
                  <input type="number" min="1" value={vowForm.minutesPerDay} onChange={e => setVowForm({...vowForm, minutesPerDay: parseInt(e.target.value)})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Motivos específicos</label>
                <textarea value={vowForm.motives} onChange={e => setVowForm({...vowForm, motives: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none dark:text-white" rows={2} required placeholder="Ej. Por la salvación de mi familia, por dirección..."></textarea>
              </div>
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Iniciar Voto</button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3 text-sm font-medium">
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-4 py-1.5 rounded-full"><Calendar className="w-4 h-4"/> Día {vow.daysCompleted} de {vow.totalDays}</div>
                <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-4 py-1.5 rounded-full"><Clock className="w-4 h-4"/> {vow.minutesPerDay} min/día</div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
                <div className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(vow.daysCompleted / vow.totalDays) * 100}%` }}></div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl text-sm text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700">
                <strong className="block mb-1 text-slate-900 dark:text-white">Motivos consagrados:</strong> 
                {vow.motives}
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={completeVowDay} 
                  disabled={vow.lastCompletedDate === new Date().toDateString()}
                  className="flex-1 sm:flex-none bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {vow.lastCompletedDate === new Date().toDateString() ? 'Día completado' : 'Marcar día completado'}
                </button>
                <button onClick={() => setConfirmDialog({isOpen: true, title: 'Cancelar Voto', message: '¿Estás seguro de cancelar tu voto de oración actual? Perderás el progreso.', onConfirm: cancelVow})} className="px-6 py-2.5 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Cancelar Voto</button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                Configuración
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto">
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3">Notificaciones</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-600 dark:text-slate-300">Activar recordatorios</span>
                  <button
                    onClick={toggleNotifications}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationsEnabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Si tu navegador no soporta notificaciones web, te mostraremos un recordatorio dentro de la aplicación cuando la tengas abierta. Para recibir avisos con la app cerrada, instálala como aplicación (PWA) y asegúrate de dar permisos.
                </p>
              </div>
              
              {notificationsEnabled && (
                <>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Frecuencia</h3>
                      <div className="flex gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="radio" name="frequency" value="daily" checked={reminderFrequency === 'daily'} onChange={() => setReminderFrequency('daily')} className="text-blue-600 dark:text-blue-500 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600" />
                          Diaria
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="radio" name="frequency" value="weekly" checked={reminderFrequency === 'weekly'} onChange={() => setReminderFrequency('weekly')} className="text-blue-600 dark:text-blue-500 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600" />
                          Semanal
                        </label>
                      </div>
                    </div>

                    {reminderFrequency === 'weekly' && (
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Días de la semana</h3>
                        <div className="flex gap-2">
                          {[{id: 1, l: 'L'}, {id: 2, l: 'M'}, {id: 3, l: 'X'}, {id: 4, l: 'J'}, {id: 5, l: 'V'}, {id: 6, l: 'S'}, {id: 0, l: 'D'}].map(day => (
                            <button
                              key={day.id}
                              onClick={() => {
                                if (reminderDays.includes(day.id)) {
                                  setReminderDays(reminderDays.filter(d => d !== day.id));
                                } else {
                                  setReminderDays([...reminderDays, day.id]);
                                }
                              }}
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${reminderDays.includes(day.id) ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                            >
                              {day.l}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Hora del recordatorio</h3>
                      <input
                        type="time"
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                    <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <BellOff className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      Silenciar notificaciones
                    </h3>
                    
                    {mutedUntil && mutedUntil > Date.now() ? (
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 flex items-center justify-between">
                        <span className="text-sm text-amber-800 dark:text-amber-300">
                          Silenciadas hasta: {new Date(mutedUntil).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        <button onClick={unmute} className="text-sm font-medium text-amber-900 dark:text-amber-200 hover:text-amber-700 dark:hover:text-amber-100 bg-amber-100 dark:bg-amber-900/50 px-3 py-1 rounded-md transition-colors">
                          Reactivar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => muteForHours(1)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors">1 hora</button>
                        <button onClick={() => muteForHours(4)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors">4 horas</button>
                        <button onClick={muteUntilTomorrow} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm rounded-lg transition-colors">Hasta mañana</button>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  Historial de Oración
                </h3>
                <div className="space-y-3">
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">No hay historial registrado aún. Tu progreso se guardará al final del día.</p>
                  ) : (
                    history.map((entry, idx) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">{entry.date}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                          {entry.items.join(', ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end shrink-0">
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              >
                Guardar y cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{confirmDialog.title}</h3>
            <p className="text-slate-600 dark:text-slate-300 mb-6 text-sm">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog({...confirmDialog, isOpen: false})} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({...confirmDialog, isOpen: false}); }} className="px-4 py-2 bg-red-600 dark:bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-700 dark:hover:bg-red-600 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white px-5 py-3 rounded-full shadow-lg z-50 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="w-4 h-4 text-blue-400" />
          {toast}
        </div>
      )}

      {/* In-App Reminder Modal */}
      {activeReminder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center relative animate-in fade-in zoom-in duration-300">
            <div className="absolute top-0 left-0 w-full h-2 bg-blue-600 dark:bg-blue-500"></div>
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Bell className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">¡Tiempo de Orar!</h3>
            <p className="text-slate-600 dark:text-slate-300 mb-8 text-base">
              "Perseverad en la oración, velando en ella con acción de gracias."
            </p>
            <button 
              onClick={() => setActiveReminder(false)} 
              className="w-full px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-xl text-base font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shadow-md hover:shadow-lg"
            >
              Comenzar a orar
            </button>
          </div>
        </div>
      )}
      {/* Focus Mode Overlay */}
      {focusMode.active && (
        <div className="fixed inset-0 bg-white dark:bg-slate-900 z-[100] flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-500">
          <div className="absolute top-4 right-4 sm:top-8 sm:right-8 flex items-center gap-4">
            <div className="text-xl sm:text-2xl font-mono font-bold text-slate-400 dark:text-slate-500">
              {formatTime(focusMode.timer)}
            </div>
            <button 
              onClick={exitFocusMode}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Salir del modo enfoque"
            >
              <X className="w-6 h-6 sm:w-8 sm:h-8" />
            </button>
          </div>

          <div className="max-w-2xl w-full text-center space-y-8 sm:space-y-12">
            <div className="space-y-3 sm:space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs sm:text-sm font-bold uppercase tracking-widest">
                {topics.flatMap(t => t.items.map(i => ({ ...i, topicTitle: t.title })))[focusMode.currentIndex]?.topicTitle}
              </div>
              <h2 className="text-3xl sm:text-6xl font-bold text-slate-900 dark:text-white leading-tight px-2">
                {topics.flatMap(t => t.items)[focusMode.currentIndex]?.text}
              </h2>
            </div>

            <div className="flex items-center justify-center gap-4 sm:gap-8">
              <button 
                onClick={prevFocusItem}
                className="p-2 sm:p-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <ChevronLeft className="w-10 h-10 sm:w-12 sm:h-12" />
              </button>
              
              <button 
                onClick={toggleFocusTimer}
                className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all shadow-xl ${
                  focusMode.isRunning 
                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' 
                    : 'bg-blue-600 dark:bg-blue-500 text-white'
                }`}
              >
                {focusMode.isRunning ? <Pause className="w-8 h-8 sm:w-10 sm:h-10" /> : <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1" />}
              </button>

              <button 
                onClick={nextFocusItem}
                className="p-2 sm:p-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <ChevronRight className="w-10 h-10 sm:w-12 sm:h-12" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4 sm:gap-6">
              <button 
                onClick={() => toggleItemInFocus(topics.flatMap(t => t.items)[focusMode.currentIndex]?.id)}
                className={`flex items-center gap-3 px-6 py-3 sm:px-8 sm:py-4 rounded-2xl font-bold text-lg sm:text-xl transition-all ${
                  topics.flatMap(t => t.items)[focusMode.currentIndex]?.checked
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {topics.flatMap(t => t.items)[focusMode.currentIndex]?.checked ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <Circle className="w-5 h-5 sm:w-6 sm:h-6" />}
                {topics.flatMap(t => t.items)[focusMode.currentIndex]?.checked ? 'Orado' : 'Marcar como orado'}
              </button>
              
              <div className="text-slate-400 dark:text-slate-500 font-medium text-sm sm:text-base">
                Motivo {focusMode.currentIndex + 1} de {topics.flatMap(t => t.items).length}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
