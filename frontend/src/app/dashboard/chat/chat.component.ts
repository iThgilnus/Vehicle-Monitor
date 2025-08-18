import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AIChatService, ChatMessage } from '../../services/ai-chat.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatIconModule, 
    MatButtonModule, 
    MatInputModule, 
    MatCardModule,
    MatProgressSpinnerModule
  ]
})
export class ChatComponent implements OnInit, AfterViewChecked {
  userMessage = '';
  chatMessages: ChatMessage[] = [];
  isLoading = false;
  
  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  constructor(private chatService: AIChatService) {}

  ngOnInit(): void {
    // Subscribe to chat history changes
    this.chatService.chatHistory$.subscribe(history => {
      this.chatMessages = history;
    });
    
    // Add welcome message if chat is empty
    if (this.chatMessages.length === 0) {
      this.chatService.addMessageToHistory({
        content: 'Hello! I can help you find information about vehicles, traffic patterns, or any other data in the system. How can I assist you today?',
        sender: 'ai',
        timestamp: new Date()
      });
    }
  }
  
  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  sendMessage(): void {
    if (!this.userMessage.trim()) return;
    
    const message = this.userMessage.trim();
    this.userMessage = '';
    this.isLoading = true;

    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        // Add AI response to chat history
        this.chatService.addMessageToHistory({
          content: response.answer,
          sender: 'ai',
          timestamp: new Date()
        });
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error sending message:', error);
        this.chatService.addMessageToHistory({
          content: 'Sorry, I encountered an error processing your request. Please try again later.',
          sender: 'ai',
          timestamp: new Date()
        });
        this.isLoading = false;
      }
    });
  }

  clearChat(): void {
    this.chatService.clearHistory();
    // Add welcome message again
    this.chatService.addMessageToHistory({
      content: 'Chat history cleared. How can I help you?',
      sender: 'ai',
      timestamp: new Date()
    });
  }

  private scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch(err) { }
  }
}
