import GameApp from './GameApp';
import {WalletProvider} from './wallet';
export default function GameScreen({practice}:{practice:boolean}){return <WalletProvider><GameApp initialPractice={practice}/></WalletProvider>;}
