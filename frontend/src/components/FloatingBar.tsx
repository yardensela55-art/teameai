import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, MessageCircle } from 'lucide-react';
import { meetings as meetingsApi } from '../lib/api';

interface Props {
  onChatOpen: () => void;
}

const GRADIENT = 'linear-gradient(to right, #89dba8, #a8d97a)';

export default function FloatingBar({ onChatOpen }: Props) {
  const navigate = useNavigate();
  const [hasActiveMeeting, setHasActiveMeeting] = useState(false);

  useEffect(() => {
    meetingsApi.list()
      .then(({ meetings }) => {
        setHasActiveMeeting(meetings.some(m => m.status === 'IN_PROGRESS'));
      })
      .catch(() => {});
  }, []);

  const handleMeetingRoom = async () => {
    try {
      const { meetings } = await meetingsApi.list();
      const active = meetings.find(m => m.status === 'IN_PROGRESS');
      if (active) {
        navigate(`/meeting-room/${active.id}`);
      } else {
        navigate('/meeting-room');
      }
    } catch {
      navigate('/meeting-room');
    }
  };

  return (
    <div className="fixed bottom-6 left-[256px] flex items-center gap-3 z-30">
      <button
        onClick={handleMeetingRoom}
        className="text-white font-semibold px-5 py-2.5 rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-sm flex items-center gap-2"
        style={{ background: GRADIENT }}
      >
        {hasActiveMeeting ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
        ) : (
          <Video size={16} />
        )}
        Quick Meeting
      </button>

      <button
        onClick={onChatOpen}
        className="text-white font-semibold px-5 py-2.5 rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-sm flex items-center gap-2"
        style={{ background: GRADIENT }}
      >
        <MessageCircle size={16} />
        Chat
      </button>
    </div>
  );
}
