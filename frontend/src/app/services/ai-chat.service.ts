import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export interface ChatConversation {
  question: string;
  answer: string;
}

@Injectable({
  providedIn: 'root'
})
export class AIChatService {
  private apiUrl = `${environment.apiUrl}/api/chat/`;
  private _chatHistory = new BehaviorSubject<ChatMessage[]>([]);
  
  public chatHistory$ = this._chatHistory.asObservable();

  constructor(private http: HttpClient) {}

  sendMessage(message: string): Observable<any> {
    // Add user message to history
    this.addMessageToHistory({
      content: message,
      sender: 'user',
      timestamp: new Date()
    });

    // Format conversation history for the API
    const conversation: ChatConversation[] = this.formatConversationHistory();
    
    return this.http.post<any>(this.apiUrl, {
      question: message,
      conversation_history: conversation
    });
  }

  addMessageToHistory(message: ChatMessage): void {
    const currentHistory = this._chatHistory.getValue();
    this._chatHistory.next([...currentHistory, message]);
  }

  clearHistory(): void {
    this._chatHistory.next([]);
  }

  getHistory(): ChatMessage[] {
    return this._chatHistory.getValue();
  }

  private formatConversationHistory(): ChatConversation[] {
    const history = this._chatHistory.getValue();
    const formattedHistory: ChatConversation[] = [];
    
    // Group messages into Q&A pairs
    for (let i = 0; i < history.length - 1; i += 2) {
      if (i + 1 < history.length) {
        formattedHistory.push({
          question: history[i].content,
          answer: history[i + 1].content
        });
      }
    }
    
    return formattedHistory;
  }
}
