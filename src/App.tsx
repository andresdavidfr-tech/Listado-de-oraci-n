import React, { useState, useEffect, useMemo } from 'react';
import { Bell, BookOpen, Plus, Trash2, CheckCircle2, Circle, Settings, X, Pencil, Check, GripVertical, Target, Calendar, Clock, AlertCircle } from 'lucide-react';
import { Reorder } from 'motion/react';

// --- Types ---
type PrayerItem = {
  id: string;
  text: string;
  checked: boolean;
};

type Topic = {
  id: string;
  title: string;
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
    items: [
      { id: '1-1', text: 'Hermano Juan', checked: false },
      { id: '1-2', text: 'Hermano Pedro', checked: false },
    ]
  },
  {
    id: '2',
    title: 'Familia',
    items: []
  },
  {
    id: '3',
    title: 'Carga personal',
    items: []
  }
];

export default function App() {
  // --- State ---
  const [topics, setTopics] = useState<Topic[]>(() => {
    const saved = localStorage.getItem('prayer-topics');
    return saved ? JSON.parse(saved) : DEFAULT_TOPICS;
  });
  
  const [lastResetDate, setLastResetDate] = useState<string>(() => {
    return localStorage.getItem('prayer-last-reset') || new Date().toDateString();
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('prayer-notifications') === 'true';
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reminderTime, setReminderTime] = useState<string>(() => {
    return localStorage.getItem('prayer-reminder-time') || '08:00';
  });
  const [lastNotifiedDate, setLastNotifiedDate] = useState<string>(() => {
    return localStorage.getItem('prayer-last-notified') || '';
  });

  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');

  // New States
  const [vow, setVow] = useState<PrayerVow>(() => {
    const saved = localStorage.getItem('prayer-vow');
    return saved ? JSON.parse(saved) : { active: false, startDate: '', totalDays: 7, minutesPerDay: 15, motives: '', daysCompleted: 0, lastCompletedDate: null };
  });
  const [vowForm, setVowForm] = useState({ totalDays: 7, minutesPerDay: 15, motives: '' });
  
  const [toast, setToast] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

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
  
  // Save topics to local storage
  useEffect(() => {
    localStorage.setItem('prayer-topics', JSON.stringify(topics));
  }, [topics]);

  // Save notifications preference
  useEffect(() => {
    localStorage.setItem('prayer-notifications', String(notificationsEnabled));
  }, [notificationsEnabled]);

  // Auto-reset checkboxes daily
  useEffect(() => {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
      setTopics(prevTopics => 
        prevTopics.map(topic => ({
          ...topic,
          items: topic.items.map(item => ({ ...item, checked: false }))
        }))
      );
      setLastResetDate(today);
      localStorage.setItem('prayer-last-reset', today);
    }
  }, [lastResetDate]);

  // Save reminder settings
  useEffect(() => {
    localStorage.setItem('prayer-reminder-time', reminderTime);
  }, [reminderTime]);

  useEffect(() => {
    localStorage.setItem('prayer-last-notified', lastNotifiedDate);
  }, [lastNotifiedDate]);

  useEffect(() => {
    localStorage.setItem('prayer-vow', JSON.stringify(vow));
  }, [vow]);

  // Notifications Logic
  useEffect(() => {
    if (!notificationsEnabled) return;

    // Request permission if not granted
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission !== 'granted') {
          setNotificationsEnabled(false);
        }
      });
    }

    const checkAndNotify = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;
      const today = now.toDateString();

      if (currentTime === reminderTime && lastNotifiedDate !== today) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Tiempo de Orar', {
            body: 'Perseverad en la oración, velando en ella con acción de gracias.',
            icon: '/favicon.ico'
          });
          setLastNotifiedDate(today);
        }
      }
    };

    // Check immediately
    checkAndNotify();

    // Then check every minute
    const interval = setInterval(checkAndNotify, 60000);
    return () => clearInterval(interval);
  }, [notificationsEnabled, reminderTime, lastNotifiedDate]);

  // --- Handlers ---

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      if ('Notification' in window) {
        try {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            setNotificationsEnabled(true);
            new Notification('¡Recordatorios activados!', {
              body: `Te recordaremos orar todos los días a las ${reminderTime}.`
            });
          } else {
            showToast('Debes permitir las notificaciones en tu navegador.');
          }
        } catch (e) {
          showToast('Error al solicitar permisos.');
        }
      } else {
        showToast('Tu navegador no soporta notificaciones web.');
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

  const saveSettings = () => {
    setIsSettingsOpen(false);
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Recordatorio configurado', {
        body: `Recibirás una notificación diaria a las ${reminderTime}.`
      });
    }
    showToast('Configuración guardada');
  };

  const addTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) return;
    
    const newTopic: Topic = {
      id: Date.now().toString(),
      title: newTopicTitle.trim(),
      items: []
    };
    
    setTopics([...topics, newTopic]);
    setNewTopicTitle('');
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
          items: [...topic.items, { id: Date.now().toString(), text: text.trim(), checked: false }]
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100">
      {/* Header / Hero Section */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <BookOpen className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">Diario de Oración</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleNotifications}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                notificationsEnabled 
                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' 
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Bell className={`w-4 h-4 ${notificationsEnabled ? 'fill-blue-600' : ''}`} />
              <span className="hidden sm:inline">
                {notificationsEnabled ? 'Recordatorios Activos' : 'Activar Recordatorios'}
              </span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              title="Configuración"
            >
              <Settings className="w-5 h-5" />
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

        {/* Voto de Oración Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800 flex items-center gap-2">
              <Target className="w-6 h-6 text-blue-600" />
              Voto de Oración
            </h2>
          </div>
          {!vow.active ? (
            <form onSubmit={startVow} className="space-y-4">
              <p className="text-sm text-slate-600 mb-4">Consagra un tiempo específico diario para orar por motivos especiales.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Días consagrados</label>
                  <input type="number" min="1" value={vowForm.totalDays} onChange={e => setVowForm({...vowForm, totalDays: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Minutos por día</label>
                  <input type="number" min="1" value={vowForm.minutesPerDay} onChange={e => setVowForm({...vowForm, minutesPerDay: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivos específicos</label>
                <textarea value={vowForm.motives} onChange={e => setVowForm({...vowForm, motives: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" rows={2} required placeholder="Ej. Por la salvación de mi familia, por dirección..."></textarea>
              </div>
              <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Iniciar Voto</button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-3 text-sm font-medium">
                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full"><Calendar className="w-4 h-4"/> Día {vow.daysCompleted} de {vow.totalDays}</div>
                <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full"><Clock className="w-4 h-4"/> {vow.minutesPerDay} min/día</div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${(vow.daysCompleted / vow.totalDays) * 100}%` }}></div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-700 border border-slate-100">
                <strong className="block mb-1 text-slate-900">Motivos consagrados:</strong> 
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
                <button onClick={() => setConfirmDialog({isOpen: true, title: 'Cancelar Voto', message: '¿Estás seguro de cancelar tu voto de oración actual? Perderás el progreso.', onConfirm: cancelVow})} className="px-6 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">Cancelar Voto</button>
              </div>
            </div>
          )}
        </section>

        {/* Topics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {topics.map(topic => (
            <div key={topic.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-semibold text-lg sm:text-xl text-slate-800">{topic.title}</h3>
                <button 
                  onClick={() => deleteTopic(topic.id)}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors bg-white hover:bg-red-50 rounded-md shadow-sm border border-slate-200"
                  title="Eliminar tema"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-5 flex-1 flex flex-col">
                {topic.items.length === 0 ? (
                  <div className="text-sm text-slate-400 italic text-center py-4 mb-4">
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
                        className="flex items-center group min-h-[44px] py-1 border-b border-slate-50 last:border-0 bg-white"
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
                              className="flex-1 bg-white border border-blue-300 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                            <button onClick={() => saveEdit(topic.id)} className="text-green-600 hover:text-green-700 p-2 bg-green-50 rounded-md">
                              <Check className="w-5 h-5" />
                            </button>
                            <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-700 p-2 bg-slate-100 rounded-md">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-400 mr-1">
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <button
                              onClick={() => toggleItemCheck(topic.id, item.id)}
                              className="flex-shrink-0 p-1 text-slate-400 hover:text-blue-600 focus:outline-none transition-colors"
                            >
                              {item.checked ? (
                                <CheckCircle2 className="w-6 h-6 text-green-500" />
                              ) : (
                                <Circle className="w-6 h-6" />
                              )}
                            </button>
                            <span className={`ml-3 text-base flex-1 transition-all ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                              {item.text}
                            </span>
                            <div className="flex items-center ml-2 space-x-1">
                              <button
                                onClick={() => startEditing(item)}
                                className="p-2 text-blue-500 hover:text-blue-700 transition-colors bg-blue-50 hover:bg-blue-100 rounded-md"
                                title="Editar"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteItem(topic.id, item.id)}
                                className="p-2 text-red-500 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100 rounded-md"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-4 pr-12 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!newItemTexts[topic.id]?.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 disabled:text-slate-300 hover:text-blue-700 transition-colors bg-white rounded-md shadow-sm border border-slate-100 disabled:bg-transparent disabled:border-transparent disabled:shadow-none"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          ))}

          {/* Add New Topic Card */}
          <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-6 flex flex-col items-center justify-center text-center min-h-[250px]">
            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-blue-600 mb-4">
              <Plus className="w-6 h-6" />
            </div>
            <h3 className="font-medium text-slate-800 mb-2">Crear nuevo tema</h3>
            <p className="text-sm text-slate-500 mb-4">Añade una nueva categoría para organizar tus oraciones.</p>
            <form onSubmit={addTopic} className="w-full max-w-xs relative">
              <input
                type="text"
                value={newTopicTitle}
                onChange={(e) => setNewTopicTitle(e.target.value)}
                placeholder="Ej. Trabajo, Viajes..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-4 pr-12 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm"
              />
              <button
                type="submit"
                disabled={!newTopicTitle.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 disabled:text-slate-300 hover:text-blue-700 transition-colors bg-slate-50 rounded-md disabled:bg-transparent"
              >
                <Plus className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-500" />
                Configuración
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Notificaciones</h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Activar recordatorios diarios</span>
                  <button
                    onClick={toggleNotifications}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationsEnabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
              
              {notificationsEnabled && (
                <div>
                  <h3 className="text-sm font-medium text-slate-900 mb-3">Hora del recordatorio</h3>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Recibirás una notificación a esta hora todos los días (requiere mantener la aplicación abierta o en segundo plano).
                  </p>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Guardar y cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-slate-600 mb-6 text-sm">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog({...confirmDialog, isOpen: false})} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog({...confirmDialog, isOpen: false}); }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-full shadow-lg z-50 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="w-4 h-4 text-blue-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
