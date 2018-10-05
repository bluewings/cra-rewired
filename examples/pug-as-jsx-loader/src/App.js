import { Component } from 'react';
import logo from './logo.svg';
import './App.css';
import template from './App.pug';

class App extends Component {
  render() {
    return template({
      // variables
      logo,
    });
  }
}

export default App;
