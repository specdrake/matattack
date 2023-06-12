import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db, getRoomFromId, getUserFromId, removeUserFromRoom, updateRoom, updateUser} from '../services/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getFirestore, getDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import './GamePage.css';

const useRealtimeFirestore = (roomId) => {
  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
    const firestore = getFirestore();
    const roomRef = doc(firestore, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const room = snapshot.data();
        setRoomData(room);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomId]);

  return roomData;
};

const GamePage = () => {
  const { roomId } = useParams();
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const [user, loading, error] = useAuthState(auth);
  const roomData = useRealtimeFirestore(roomId);
  const [selectedCell, setSelectedCell] = useState('');
  const [toAttack, setToAttack] = useState(null);
  const [player1Details, setPlayer1Details] = useState('');
  const [player2Details, setPlayer2Details] = useState('');
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [winner, setWinner] = useState(null);
  const [listening, setListening] = useState(false);
  const [locked, setLocked] = useState(false);
  const [sentEmail, setSentEmail] = useState(false);
  const [otherDisconnected, setOtherDisconnected] = useState(false);

  useEffect(() => {
    let intervalId; // Interval ID for the "lastActive" update

    const startUpdatingLastActive = () => {
      intervalId = setInterval(() => {
        // Update the "lastActive" field for the current user
        updateDoc(doc(db, 'users', user.uid), {
          lastActive: new Date()
        }).catch(error => {
          console.log('Error updating user lastActive:', error);
        });
      }, 5000); // Update every 5 seconds
    };

    const sendEmailNotification = (userId, roomId) => {
  const userRef = doc(db, 'users', userId);

  getDoc(userRef)
    .then(snapshot => {
      if (snapshot.exists()) {
        const user = snapshot.data();
        const email = user.email;

        sendPasswordResetEmail(auth, email, {
          url: `https://your-website.com/rooms/roomId=${roomId}`,
          handleCodeInApp: true
        })
          .then(() => {
            console.log('Email notification sent successfully');
          })
          .catch(error => {
            console.log('Error sending email notification:', error);
          });
      }
    })
    .catch(error => {
      console.log('Error fetching user data:', error);
    });
};


    const checkUserDisconnection = () => {
      if(!roomData)
        return;
      const checkIntervalId = setInterval(async () => {
        const otherPlayerId = (roomData.player1 === user.uid ? roomData.player2 : roomData.player1);
        console.log(`Other player ID: ${otherPlayerId}`);
        if (!otherPlayerId) {
          console.log('No other player in the room');
          return; // No other player in the room
        }
        getUserFromId(otherPlayerId)
        .then((user) => {
          const lastActiveTimestamp = user.lastActive?.toDate()?.getTime();
          if(!lastActiveTimestamp) {
            console.log('No lastActiveTimestamp');
            return;
         }
          const currentTimestamp = new Date().getTime();
          const elapsedSeconds = Math.floor((currentTimestamp - lastActiveTimestamp) / 1000);

          console.log(`elapsedSeconds: ${elapsedSeconds}`)
          if (elapsedSeconds > 10) {
            // Other player disconnected
            console.log("disconnected");
            if(otherDisconnected) {
              console.log('Still Disconnected');
              if(elapsedSeconds > 300) {// 5 minutes 
                console.log("Ending Game")
                navigate('/'); // End the game
              }
            }
            setOtherDisconnected(true);
            const disconnectionTimestamp = new Date().getTime();
            const updatedRoomData = {
              disconnectionTimestamp: disconnectionTimestamp
            };

          // Update the room data in Firebase Firestore
          updateRoom(roomId, updatedRoomData).then(() => {
            setMessage('Other player disconnected.');
            if(!sentEmail) {
              console.log(`Sending email notification to ${otherPlayerId}`)
              sendEmailNotification(otherPlayerId, roomId);
              console.log(`Sent email notification to ${otherPlayerId}`)
              setSentEmail(true);
            }
          }).catch(error => {
            console.log('Error updating room:', error);
          });

          clearInterval(checkIntervalId); // Stop checking for disconnection
        } else {
          if(otherDisconnected) {
            setMessage('Other player connected.');
          }
          setOtherDisconnected(false);
        }
      })
        .catch((e) => {
          console.log('checkUserDisconnection: error getting other player details', e);
        });
      }, 5000); // Check every 5 seconds
      return () => {
        clearInterval(checkIntervalId); // Clear the interval when the component unmounts
      };
    };

    startUpdatingLastActive();
    checkUserDisconnection();

    // Cleanup function
    return () => {
      clearInterval(intervalId); // Stop updating "lastActive"
    };
  }, [user, roomId, roomData, setMessage, sentEmail]);

    useEffect(() => {
    if (roomData && roomData.scores) {
      const { player1, player2 } = roomData;
      getUserFromId(player1)
        .then((user) => {
          setPlayer1Details(user);
        })
        .catch((e) => {
          console.log('GamePage: error getting player1 details', e);
        });

      getUserFromId(player2)
        .then((user) => {
          setPlayer2Details(user);
        })
        .catch((e) => {
          console.log('GamePage: error getting player2 details', e);
        });

      setPlayer1Score(roomData.scores[player1]);
      setPlayer2Score(roomData.scores[player2]);
    }
  }, [roomData]);

  useEffect(() => {
    if (loading) {
      console.log('GamePage: loading auth state');
    } else if (error) {
      console.log('GamePage: error in auth state');
      navigate('/');
    } else {
      console.log('GamePage: success in auth state');
      console.log(`GamePage: user: ${user.uid}`);
    }
  }, [user, loading, error, navigate]);

  useEffect(() => {
    // when roomData is ready and game is ready
    if (roomData && roomData.players && roomData.players.length === 2) {
      console.log('GamePage: Game is ready');
    }
    if(user && roomData && (user.uid !== roomData.player1 && user.uid !== roomData.player2)) {
      console.log('GamePage: user not in room');
      navigate('/');
    }
  }, [roomData, navigate, user]);

  const pause = (duration) => {
    setTimeout(() => {
      // Code to be executed after 3 seconds
      console.log(`Pause of ${duration} seconds complete!`);
    }, duration * 1000);
  };
  const displayWinnerMessage = useCallback(() => {
    if(winner === 'Draw') {
      setMessage('Game Draw!');
    } else  if (winner === player1Details.uid) {
      setMessage(`${player1Details.name}(${player1Details.email}) won the game!`);
    } else if (winner === player2Details.uid) {
      setMessage(`${player2Details.name}(${player2Details.email}) won the game!`);
    } else {
      setMessage('Game Invalid!');
    }
  }, [winner, player1Details, player2Details]);


  useEffect(() => { 
    if(!roomData || !user) {
      return;
    }
    console.log("changing toAttack, from: ", toAttack, " to:")
    if(roomData.turn) {
      if(user.uid === roomData.player1)      
        setToAttack(true);
      else
        setToAttack(false);
    }else {
      if(user.uid === roomData.player2)      
        setToAttack(true);
      else
        setToAttack(false);
    }
    console.log(toAttack);
  }, [roomData, user, toAttack]); 

  useEffect(() => {
    // perform update of score and reinitialisation when both choices are locked
    if(winner) {
      displayWinnerMessage();
      setLocked(true);
      return;
    }
    // console.log("---------> useEffect: roomData: ", JSON.stringify(roomData));
    console.log("toAttack: ", toAttack);
    const reInitForNextTurn = (increaseRound = true) => {
      updateRoom(roomId, {
      attackChoice: '',
      defenseChoice: '',
      roundsDone: roomData.roundsDone + (increaseRound ? 1 : 0),
      turn: increaseRound ? (!roomData.turn) : roomData.turn,
      });
      setLocked(false);
    }
    if(roomData && roomData.attackChoice && roomData.attackChoice !== '' && roomData.defenseChoice && roomData.defenseChoice !== '') {
      console.log("-----------------------here-----------------------------")
      try{
        console.log("------->>>>>", JSON.stringify(roomData.scores));
        const player1Score = roomData.scores[roomData.player1]
        const player2Score = roomData.scores[roomData.player2]
        console.log(`player1 score: ${player1Score} player2 score: ${player2Score}`);
        if(roomData.turn) {
          //player 1 was attacker
          if(roomData.attackChoice === roomData.defenseChoice) {
            //attacker lose 
            console.log("attacker lost")
            if(toAttack) {
              setMessage('You lose the round!');
            }else {
              setMessage('You win the round!');
            }
            updateRoom(roomId, {
              scores: {
                [roomData.player1]: player1Score - 1,
                [roomData.player2]: player2Score + 1,
              },
            });
          } else {
            if(!toAttack) {
              setMessage('You lose the round!');
            }else {
              setMessage('You win the round!');
            }
            updateRoom(roomId, {
              scores: {
                [roomData.player1]: player1Score + 1,
                [roomData.player2]: player2Score - 1,
              },
            });
          }
        }else {
          //player 2 was attacker
          if(roomData.attackChoice === roomData.defenseChoice) {
            // attacker lose 
            if(toAttack) {
              setMessage('You lose the round!');
            }else {
              setMessage('You win the round!');
            }
            updateRoom(roomId, {
            scores: {
              [roomData.player1]: player1Score + 1,
              [roomData.player2]: player2Score - 1,
            },
            });
          } else {
            if(!toAttack) {
              setMessage('You lose the round!');
            }else {
              setMessage('You win the round!');
            }
            updateRoom(roomId, {
            scores: {
              [roomData.player1]: player1Score - 1,
              [roomData.player2]: player2Score + 1,
            },
            });
          }
        }
      } catch (e) {
        console.log('GamePage: error updating score', e);
        reInitForNextTurn(false);
      }
      pause(2);
      const cell = document.getElementById(selectedCell);
      if(cell) {
        cell.style.backgroundColor = 'white';
      }
      reInitForNextTurn();
    }
  }, [roomData, roomId, selectedCell, user, toAttack, winner, displayWinnerMessage]);
  console.log('GamePage: roomData:', roomData);

  useEffect(() => {
    // handle game end
    if(roomData && roomData.roundsDone && roomData.roundsDone >= 10) {
      if(roomData.scores[roomData.player1] === roomData.scores[roomData.player2]) {
        setWinner('Draw');
      }else {
        setWinner(roomData.scores[roomData.player1] > roomData.scores[roomData.player2] ? roomData.player1 : roomData.player2);
      }

      if(winner === player1Details.uid) {
        updateRoom(roomId, {winner: winner});
        updateUser(player1Details.uid, {gamesPlayed: player1Details.gamesPlayed + 1, gamesWon: player1Details.gamesWon + 1, totalScore: player1Details.totalScore + roomData.scores[player1Details.uid]});
        updateUser(player2Details.uid, {gamesPlayed: player2Details.gamesPlayed + 1, gamesLost: player2Details.gamesLost + 1, totalScore: player2Details.totalScore + roomData.scores[player2Details.uid]});
      }
      else if(winner === player2Details.uid){
        updateRoom(roomId, {winner: winner});
        updateUser(player1Details.uid, {gamesPlayed: player1Details.gamesPlayed + 1, gamesLost: player1Details.gamesLost + 1, totalScore: player1Details.totalScore + roomData.scores[player1Details.uid]});
        updateUser(player2Details.uid, {gamesPlayed: player2Details.gamesPlayed + 1, gamesWon: player2Details.gamesWon + 1, totalScore: player2Details.totalScore + roomData.scores[player2Details.uid]});
      }
      else if(winner === 'Draw') {
        updateRoom(roomId, {winner: 'Draw'});
        updateUser(player1Details.uid, {gamesPlayed: player1Details.gamesPlayed + 1, gamesDrawn: player1Details.gamesDrawn+ 1, totalScore: player1Details.totalScore + roomData.scores[player1Details.uid]});
        updateUser(player2Details.uid, {gamesPlayed: player2Details.gamesPlayed + 1, gamesDrawn: player2Details.gamesWon + 1, totalScore: player2Details.totalScore + roomData.scores[player2Details.uid]});
      }
      else {
        updateRoom(roomId, {winner: 'Invalid'});
      }
      displayWinnerMessage();
      setLocked(true);
    }
  }, [roomData, player1Details, player2Details, winner, roomId, displayWinnerMessage]);

  

  const handleCellClick = useCallback((matrix, row, col) => {
    // Handle the logic for cell click event
    if(winner) {
      displayWinnerMessage();
      return;
    }
    if(matrix < 0 || matrix > 1 || col < 0 || col > 2 || row < 0 || row > 2) {
      setMessage('Invalid cell');
    }
    if((toAttack && roomData.attackChoice && roomData.attackChoice !== '') || (!toAttack && roomData.defenseChoice && roomData.defenseChoice !== '')) {
      setMessage('You have already locked your choice');
      return;
    }
    const clearSelectedCell = () => {
      if(selectedCell) {
        const cell = document.getElementById(selectedCell);
        if(cell) {
          cell.style.backgroundColor = 'white';
        }
        setSelectedCell('');
      }
    }
    clearSelectedCell();

    const turn = roomData.turn;
    if((turn && (matrix === 0)) || (!turn && (matrix === 1))) {
      //cannot click on this matrix
      setMessage('Not this matrix, click on the other!');
      return;
    }
    const getCellName = (matrix, row, col) => {
      if(row === 0 && col === 0) {
        return `${matrix}A`;
      }
      if(row === 0 && col === 1) {
        return `${matrix}B`;
      }
      if(row === 1 && col === 0) { 
        return `${matrix}C`;
      }
      if(row === 1 && col === 1) {
        return `${matrix}D`;
      }
    }
    if(toAttack) {
      const cellName = getCellName(matrix, row, col);
      setMessage(`Attacking cell ${cellName}`);
      const cell = document.getElementById(cellName);
      if(cell) {
        cell.style.backgroundColor = 'red';
        setSelectedCell(cellName)
      }
    } else {
      const cellName = getCellName(matrix, row, col);
      setMessage(`Defending cell ${cellName}`);
      const cell = document.getElementById(cellName);
      if(cell) {
        cell.style.backgroundColor = 'blue';
        setSelectedCell(cellName)
      }
    }
  }, [roomData, toAttack, winner, selectedCell, displayWinnerMessage]);

    const lockChoice = useCallback(() => {
    if(toAttack) {
      updateRoom(roomId, {
        attackChoice: selectedCell,
      });
      if(selectedCell) {
        const cell = document.getElementById(selectedCell);
        if(cell) {
          cell.style.backgroundColor = 'red';
        }
      }
    } else {
      updateRoom(roomId, {
        defenseChoice: selectedCell,
      });
      if(selectedCell) {
        const cell = document.getElementById(selectedCell);
        if(cell) {
          cell.style.backgroundColor = 'blue';
        }
      }
    }
    setLocked(true);
    setMessage('Choice locked at ' + selectedCell);
  }, [roomId, selectedCell, toAttack]);

    useEffect(() => {
    // to clear lock when next round has started
    if(winner) {
      displayWinnerMessage();
      return;
    }
    if(locked) {
      if(toAttack && !roomData.attackChoice) {
        setLocked(false);
        return;
      }
      if(!toAttack && !roomData.defenseChoice) {
        setLocked(false);
        return;
      } 
    }
  }, [locked, setLocked, lockChoice, selectedCell, toAttack, winner, displayWinnerMessage, roomData]);



    const printScores = () => {
    if (!player1Details|| !player2Details) {
      return null; // or return a loading indicator if the names are not available yet
    }

    return (
      <div className="scores-container">
        <h2>Player Scores:</h2>
        <div className="scores-box">
          <p>
            <span className="player-name">{player1Details.name}({player1Details.email}) -> </span>
            <span className="player-score">{player1Score}</span>
          </p>
          <p>
            <span className="player-name">{player2Details.name}({player2Details.email}) -> </span>
            <span className="player-score">{player2Score}</span>
          </p>
        </div>
      </div>
    );
  };

 //-----------------------Speech Commands functionality-------------------- 
const handleVoiceCommand = (transcript) => {
  console.log('handleVoiceCommand: voice command transcript:', transcript)
  const command = transcript.toLowerCase();
  const attackRegex = /^(attack|defend)\s*(\d)\s*(\d)$/i;
  console.log('GamePage: attackRegex:', attackRegex)

  if (attackRegex.test(command)) {
    console.log('handleVoiceCommand: attackRegex.test(command): matches')
    const match = attackRegex.exec(command);
    const action = match[1].toLowerCase();
    const row = parseInt(match[2], 10) - 1; // Convert number to row index (0-based)
    const col = parseInt(match[3], 10) - 1; // 
    console.log('handleVoiceCommand: action:', action)
    console.log('handleVoiceCommand: row:', row)
    console.log('handleVoiceCommand: col:', col)

    if (toAttack && action !== 'attack') {
      console.log('You can only attack!');
      setMessage('You can only attack!');
      return;
    } else if (!toAttack && action !== 'defend') {
      console.log('You can only defend!');
      setMessage('You can only defend!');
      return;
    }
    
    handleCellClick(roomData ? (roomData.turn ? 1 : 0) : 0, row, col);
  } else if (command === 'lock choice') {
    lockChoice();
  }
};

const handleVoiceButton = () => {
  setListening(true);

  // Start speech recognition
  const recognition = new window.webkitSpeechRecognition();
  recognition.lang = 'en-US';

  recognition.start();

  // Handle speech recognition result
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('Transcript:', transcript);
    handleVoiceCommand(transcript);
  };

  // Handle speech recognition end
  recognition.onend = () => {
    setListening(false);
  };
};

 //---------------------

  return (
    <div>
      <div className="pageHeading"><h1>Game Page</h1></div>
      {message && <div className="message">{message}</div>}
      {roomData && <div className="rounds"><h2>Round: {roomData.roundsDone + 1}</h2></div>}
      {roomData && <div className="scores"><h2>{printScores()}</h2></div>}
      {roomData && (
        <div className="matrix-container">
          <table className="matrix" border="2px solid black;">
            <tr>
              <td id="0A" onClick={() => handleCellClick(0, 0, 0)}>A</td>
              <td id="0B" onClick={() => handleCellClick(0, 0, 1)}>B</td>
            </tr>
            <tr>
              <td id="0C" onClick={() => handleCellClick(0, 1, 0)}>C</td>
              <td id="0D" onClick={() => handleCellClick(0, 1, 1)}>D</td>
            </tr>
          </table>
          <table className="matrix" border="2px solid black;">
            <tr>
              <td id="1A" onClick={() => handleCellClick(1, 0, 0)}>A</td>
              <td id="1B" onClick={() => handleCellClick(1, 0, 1)}>B</td>
            </tr>
            <tr>
              <td id="1C" onClick={() => handleCellClick(1, 1, 0)}>C</td>
              <td id="1D" onClick={() => handleCellClick(1, 1, 1)}>D</td>
            </tr>
          </table>
      </div>
      )}
      <div className="actionButton"> 
        <button onClick={() => {lockChoice()}} disabled={locked}>{toAttack ? "Attack" : "Defend"} </button>
        <button onClick={handleVoiceButton} disabled={listening || locked}> 
        <i className="fa fa-microphone"></i> Voice Command
        </button>
      </div>
    </div>
  );
};

export default GamePage;