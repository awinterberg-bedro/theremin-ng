import {Component, signal} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {Theremin} from './theremin/theremin';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Theremin],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('themerin-ng');
}
