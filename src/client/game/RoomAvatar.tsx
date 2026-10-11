import { Avatar } from '../../components/Avatar';
import { useRoom } from '../pages/RoomPage';

export function RoomAvatar(props: Parameters<typeof Avatar>[0]) {
  const { snap } = useRoom();
  const member = snap.room?.members.find((m) => m.id === props.id);
  return <Avatar {...props} avatar={member?.avatar} bot={member?.isBot} />;
}
