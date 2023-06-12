import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db, getRoomFromId, getUserFromId, removeUserFromRoom, updateRoom, updateUserLastActiveTime } from '../services/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

import { doc, onSnapshot } from 'firebase/firestore';
import './GameLobby.css';

const useRealtimeFirestore = (db, roomId) => {
  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
    const roomRef = doc(db, 'rooms', roomId);

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const room = snapshot.data();
        setRoomData(room);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomId, db]);

  return roomData;
};

const GameLobby = () => {
  const { roomId } = useParams();
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const [user, loading, error] = useAuthState(auth);
  const [isGameReady, setIsGameReady] = useState(false);
  const [playerMap, setPlayerMap] = useState({});
  const [gameStarted, setGameStarted] = useState(false);
  const roomData = useRealtimeFirestore(db, roomId); // Use the custom Firestore hook

  useEffect(() => {
    if (loading) {
      console.log('RoomPage: loading auth state');
    } else if (error) {
      console.log('RoomPage: error in auth state');
      navigate('/');
    } else {
      console.log('RoomPage: success in auth state');
      console.log(`RoomPage: user: ${user.uid}`);
    }
  }, [user, loading, error, navigate]);

  useEffect(() => {
    if (roomData && roomData.players && roomData.players.length === 2) {
      setIsGameReady(true);
    } else {
      setIsGameReady(false);
    }
    if(roomData && roomData.gameStarted) {
        setGameStarted(true);
        navigate(`/game/${roomId}`);
    }

  }, [roomData, navigate, roomId]);

  useEffect(() => {
    if (roomData && roomData.players) {
      const getPlayerNames = async () => {
        const namesPromises = roomData.players.map((playerId) =>
          getUserFromId(playerId)
            .then((user) => user.name)
            .catch((err) => {
              console.error(err);
              return "Anon";
            })
        );
        const names = await Promise.all(namesPromises);
        const newPlayerMap = {};
        roomData.players.forEach((playerId, index) => {
          newPlayerMap[playerId] = names[index];
        });
        setPlayerMap(newPlayerMap);
      };

      getPlayerNames();
    }
  }, [roomData]);

  const handleStartGame = () => {
    if (isGameReady) {
      // Redirect to the game page
      updateRoom(roomId, { gameStarted: true , player1: roomData.players[0], player2: roomData.players[1], turn: true, roundsDone: 0})
      .then((res) => {
        console.log(`handleStartGame: updated room: ${res}`);
        getRoomFromId(roomId)
        .then((res) => {
          updateUserLastActiveTime(res.player1)
          .then(() => {
          updateUserLastActiveTime(res.player2)
          });
          navigate(`/game/${roomId}`);
        });
      })
        .catch((err) => {
            console.error('handleStartGame: error starting room', err);
        });
        navigate(`/game/${roomId}`);
    };
  }

  const handlePlayerLeave = (userId) => {
    // Update the roomData state by removing the player from the players array
    if (roomData) {
      const updatedPlayers = roomData.players.filter((user) => user !== userId);
      console.log(`handlePlayerLeave: updated players: ${updatedPlayers}`);
      removeUserFromRoom(roomId, userId)
        .then((res) => {
          console.log(`handlePlayerLeave: removed user from room: ${res}`);
        })
        .catch((err) => {
          console.error('handlePlayerLeave: error removing user from room', err);
        });
    }
  };

  return (
    <div>
      <h2>Game Lobby</h2>
      {message && <div className="message">{message}</div>}
      {roomData && (
        <div>
          <p>Active Players:</p>
          <ul>
            {roomData.players.map((player) => (
              <li key={player}>
                Player {player} {playerMap[player]}
                {player === user.uid && (
                  <button onClick={() => handlePlayerLeave(player)}>Leave</button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={handleStartGame} disabled={!isGameReady || gameStarted}>
            {gameStarted ? 'Game Started' : 'Start Game'}
          </button>
        </div>
      )}
    </div>
  );
};

export default GameLobby;
