"""
1. Using PyQt5, make an application UI that is a black canvas. 
2. Using asyncio and websockets, report the touch events to a websocket server at an arbitrary combination of IP address and port number.
"""

import sys
from PyQt5.QtWidgets import QApplication, QWidget, QLabel, QLineEdit, QVBoxLayout, QHBoxLayout, QGridLayout, QMainWindow, QAction
from PyQt5.QtGui import QIcon, QPixmap
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtCore import QThread, pyqtSignal
import asyncio
import websockets
import json
from config import address, port

IP = address['touchscreen']
PORT = port['touchscreen']

class MyWindow(QMainWindow):
    def __init__(self):
        super(MyWindow, self).__init__()
        self.setGeometry(200, 200, 600, 400)
        self.setWindowTitle("MyWindow")
        self.setWindowIcon(QIcon('icon.png'))
        self.initUI()

    def initUI(self):
        self.label = QLabel(self)
        self.label.setText("MyWindow")
        self.label.move(100, 100)
        self.label.setStyleSheet("background-color: black;")
        self.setCentralWidget(self.label)
        self.statusBar().showMessage('Ready')
        self.show()

    def mousePressEvent(self, event):
        print("Mouse pressed")
        self.statusBar().showMessage('Mouse pressed')
        self.update()
        asyncio.get_event_loop().run_until_complete(self.send_event(event))

    async def send_event(self, event):
        print("Sending event")
        async with websockets.connect(f"ws://{IP}:{PORT}") as websocket:
            await websocket.send(json.dumps({'event': 'click', 'x': event.x(), 'y': event.y()}))
            self.statusBar().showMessage(f"Data sent: [click <{event.x()}, {event.y()}>]")
            self.update()
        

def main():
    app = QApplication(sys.argv)
    window = MyWindow()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()