#include <GL/glew.h>
#include <SFML/Graphics.hpp>
#include <SFML/OpenGL.hpp>
#include <SFML/Window.hpp>
#include <SOIL/SOIL.h>
#include <iostream>
#include <iomanip>
#include <cmath>

#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

// ID шейдерной программы
GLuint Program;
GLuint Program1;

// ID атрибута
GLint modelUniformID = 0;
GLint coordAttribID = 1;
GLint colorUniformID = 2;

GLuint VBO_cube;
GLuint VBO_pentagon;
GLuint VBO_square;

time_t start_time;
const GLfloat Pi = 3.14159274101257324219f;

struct Vertex {
    GLfloat x;
    GLfloat y;
    GLfloat z;
};

struct Color {
    GLfloat r;
    GLfloat g;
    GLfloat b;
};

// Исходный код вершинного шейдера
const char* VertexShaderSource = R"(
 #version 330 core
 #extension GL_ARB_explicit_uniform_location : enable

 layout (location = 0) uniform mat4 model;
 layout (location = 1) in vec3 position;

 void main() {
    gl_Position = model * vec4(position, 1.0f);
 }
)";

// Исходный код фрагментного шейдера
const char* FragShaderSource = R"(
 #version 330 core
 #extension GL_ARB_explicit_uniform_location : enable

 layout (location = 2) uniform vec3 mainColor;    

 out vec4 color;

 void main() {
    color = vec4(mainColor, 1.0f);
 }
)";

// Исходный код вершинного шейдера
const char* VertexShaderSource1 = R"(
 #version 330 core
 #extension GL_ARB_explicit_uniform_location : enable

 layout (location = 0) uniform mat4 model;
 layout (location = 1) in vec3 position;
 
 out vec3 vertexPosition; 

 void main() {
    gl_Position = model * vec4(position, 1.0f);
    vertexPosition = position;
 }
)";

// Исходный код фрагментного шейдера
const char* FragShaderSource1 = R"(
 #version 330 core
 #extension GL_ARB_explicit_uniform_location : enable

 layout (location = 2) uniform vec3 mainColor;
 in vec3 vertexPosition;

 out vec4 color;

 void main() {
    int k = 10;
    if (mod(int(vertexPosition.x * k + k), 2) == 0){
        color = vec4(mainColor, 1.0f);
    } else{
        color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
    }
 }
)";

// Проверяем наличие ошибок OpenGL
void checkOpenGLerror() {
    GLenum err;
    while ((err = glGetError()) != GL_NO_ERROR)
    {
        std::cout << "Error! Code: " << std::hex << err << std::dec << std::endl;
    }
}

// Проверяем наличие ошибок компиляции шейдера
void ShaderLog(unsigned int shader)
{
    int infologLen = 0;
    glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &infologLen);
    if (infologLen > 1)
    {
        int charsWritten = 0;
        std::vector<char> infoLog(infologLen);
        glGetShaderInfoLog(shader, infologLen, &charsWritten, infoLog.data());
        std::cout << "InfoLog: " << infoLog.data() << std::endl;
    }
}

// Инициализируем вершинный буфер
void InitVBO() {
    glGenBuffers(1, &VBO_cube);
    glGenBuffers(1, &VBO_pentagon);
    glGenBuffers(1, &VBO_square);

    Vertex cube[36] = {
        {-1.0f, -1.0f, 1.0f},
        {-1.0f, 1.0f, 1.0f},
        {1.0f, 1.0f, 1.0f},
        {-1.0f, -1.0f, 1.0f},
        {1.0f, 1.0f, 1.0f},
        {1.0f, -1.0f, 1.0f},

        {-1.0f, -1.0f, -1.0f},
        {1.0f, -1.0f, -1.0f},
        {1.0f, 1.0f, -1.0f},
        {-1.0f, -1.0f, -1.0f},
        {1.0f, 1.0f, -1.0f},
        {-1.0f, 1.0f, -1.0f},

        {-1.0f, -1.0f, -1.0f},
        {-1.0f, 1.0f, -1.0f},
        {-1.0f, 1.0f, 1.0f},
        {-1.0f, -1.0f, -1.0f},
        {-1.0f, 1.0f, 1.0f},
        {-1.0f, -1.0f, 1.0f},

        {1.0f, -1.0f, -1.0f},
        {1.0f, -1.0f, 1.0f},
        {1.0f, 1.0f, 1.0f},
        {1.0f, -1.0f, -1.0f},
        {1.0f, 1.0f, 1.0f},
        {1.0f, 1.0f, -1.0f},

        {-1.0f, 1.0f, -1.0f},
        {-1.0f, 1.0f, 1.0f},
        {1.0f, 1.0f, 1.0f},
        {-1.0f, 1.0f, -1.0f},
        {1.0f, 1.0f, 1.0f},
        {1.0f, 1.0f, -1.0f},

        {-1.0f, -1.0f, -1.0f},
        {1.0f, -1.0f, -1.0f},
        {1.0f, -1.0f, 1.0f},
        {-1.0f, -1.0f, -1.0f},
        {1.0f, -1.0f, 1.0f},
        {-1.0f, -1.0f, 1.0f}
    };

    Vertex pentagon[7];
    pentagon[0] = { 0.0f, 0.0f, 0.0f };
    for (int i = 0; i < 5; i++) {
        GLfloat angle = 72.0f * i;
        pentagon[i + 1] = { cos(angle / 180.0f * Pi), sin(angle / 180.0f * Pi), 0.0f };
    }
    pentagon[6] = pentagon[1];

    Vertex square[6] = {
        {-1.0f, -1.0f, 0.0f},
        {-1.0f, 1.0f, 0.0f},
        {1.0f, 1.0f, 0.0f},
        {-1.0f, -1.0f, 0.0f},
        {1.0f, 1.0f, 0.0f},
        {1.0f, -1.0f, 0.0f}
    };


    // Передаем вершины в буфер
    glBindBuffer(GL_ARRAY_BUFFER, VBO_cube);
    glBufferData(GL_ARRAY_BUFFER, sizeof(cube), cube, GL_STATIC_DRAW);

    glBindBuffer(GL_ARRAY_BUFFER, VBO_pentagon);
    glBufferData(GL_ARRAY_BUFFER, sizeof(pentagon), pentagon, GL_STATIC_DRAW);

    glBindBuffer(GL_ARRAY_BUFFER, VBO_square);
    glBufferData(GL_ARRAY_BUFFER, sizeof(square), square, GL_STATIC_DRAW);

    glBindBuffer(GL_ARRAY_BUFFER, 0);
    checkOpenGLerror(); //Пример функции есть в лабораторной
    // Проверка ошибок OpenGL, если есть, то вывод в консоль тип ошибки
}

// Собираем шейдеры в программу
void InitShader() {
    GLuint vShader, fShader;
    int link_ok;

    vShader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vShader, 1, &VertexShaderSource, NULL);
    glCompileShader(vShader);
    std::cout << "vertex shader \n";
    ShaderLog(vShader);

    fShader = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fShader, 1, &FragShaderSource, NULL);
    glCompileShader(fShader);
    std::cout << "fragment shader \n";
    ShaderLog(fShader);

    // Создаем программу и прикрепляем шейдеры к ней
    Program = glCreateProgram();
    glAttachShader(Program, vShader);
    glAttachShader(Program, fShader);
    glLinkProgram(Program);

    glGetProgramiv(Program, GL_LINK_STATUS, &link_ok);
    if (!link_ok) {
        std::cout << "error attach shaders \n";
        return;
    }

    //-------------------------------------------------

    vShader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vShader, 1, &VertexShaderSource1, NULL);
    glCompileShader(vShader);
    std::cout << "vertex shader \n";
    ShaderLog(vShader);

    fShader = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fShader, 1, &FragShaderSource1, NULL);
    glCompileShader(fShader);
    std::cout << "fragment shader \n";
    ShaderLog(fShader);

    // Создаем программу и прикрепляем шейдеры к ней
    Program1 = glCreateProgram();
    glAttachShader(Program1, vShader);
    glAttachShader(Program1, fShader);
    glLinkProgram(Program1);

    glGetProgramiv(Program1, GL_LINK_STATUS, &link_ok);
    if (!link_ok) {
        std::cout << "error attach shaders \n";
        return;
    }

    checkOpenGLerror();
}


// Вызываем все инициализации
void Init() {
    // Шейдеры
    InitShader();
    // Вершинный буфер
    InitVBO();

    glEnable(GL_DEPTH_TEST);
}

// Отрисовка на каждом шаге
void Draw() {
    glUseProgram(Program); // Устанавливаем шейдерную программу текущей

    glm::mat4 model0 = glm::mat4(1.0f);
    model0 = glm::translate(model0, glm::vec3(0.0f, 0.0f, 0.0f));
    model0 = glm::scale(model0, glm::vec3(0.2f, 0.2f, 0.2f));
    model0 = glm::rotate(model0, (GLfloat)glm::radians(45.0f), glm::vec3(1.0f, 1.0f, 0.0f));
    glUniformMatrix4fv(modelUniformID, 1, GL_FALSE, glm::value_ptr(model0));
    glUniform3f(colorUniformID, 1.0f, 1.0f, 0.0f);

    glBindBuffer(GL_ARRAY_BUFFER, VBO_cube); // Подключаем VBO

    // сообщаем OpenGL как он должен интерпретировать вершинные данные.
    glEnableVertexAttribArray(coordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(coordAttribID, 3, GL_FLOAT, GL_FALSE, 12, (GLvoid*)0);

    glBindBuffer(GL_ARRAY_BUFFER, 0); // Отключаем VBO
    glDrawArrays(GL_TRIANGLES, 0, 36); // Передаем данные на видеокарту(рисуем)

    //_______________________________________________________

    glm::mat4 model1 = glm::mat4(1.0f);
    model1 = glm::translate(model1, glm::vec3(-0.75f, 0.0f, 0.0f));
    model1 = glm::scale(model1, glm::vec3(0.2f, 0.2f, 0.2f));
    //model0 = glm::rotate(model0, (GLfloat)glm::radians((clock() - start_time) * 0.1f), glm::vec3(1.0f, 1.0f, 0.0f));
    glUniformMatrix4fv(modelUniformID, 1, GL_FALSE, glm::value_ptr(model1));
    glUniform3f(colorUniformID, 1.0f, 0.0f, 0.0f);

    glBindBuffer(GL_ARRAY_BUFFER, VBO_pentagon); // Подключаем VBO

    // сообщаем OpenGL как он должен интерпретировать вершинные данные.
    glEnableVertexAttribArray(coordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(coordAttribID, 3, GL_FLOAT, GL_FALSE, 12, (GLvoid*)0);

    glBindBuffer(GL_ARRAY_BUFFER, 0); // Отключаем VBO
    glDrawArrays(GL_TRIANGLE_FAN, 0, 7); // Передаем данные на видеокарту(рисуем)

    //_______________________________________________________

    glUseProgram(Program1); // Устанавливаем шейдерную программу текущей

    glm::mat4 model2 = glm::mat4(1.0f);
    model2 = glm::translate(model2, glm::vec3(0.7f, 0.0f, 0.0f));
    model2 = glm::scale(model2, glm::vec3(0.2f, 0.2f, 0.2f));
    //model0 = glm::rotate(model0, (GLfloat)glm::radians(45.0f), glm::vec3(1.0f, 1.0f, 0.0f));
    glUniformMatrix4fv(modelUniformID, 1, GL_FALSE, glm::value_ptr(model2));
    glUniform3f(colorUniformID, 1.0f, 0.0f, 1.0f);

    glBindBuffer(GL_ARRAY_BUFFER, VBO_square); // Подключаем VBO

    // сообщаем OpenGL как он должен интерпретировать вершинные данные.
    glEnableVertexAttribArray(coordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(coordAttribID, 3, GL_FLOAT, GL_FALSE, 12, (GLvoid*)0);

    glBindBuffer(GL_ARRAY_BUFFER, 0); // Отключаем VBO
    glDrawArrays(GL_TRIANGLES, 0, 6); // Передаем данные на видеокарту(рисуем)

    //_______________________________________________________

    glDisableVertexAttribArray(coordAttribID); // Отключаем массив атрибутов

    glUseProgram(0); // Отключаем шейдерную программу

    checkOpenGLerror();
}

// Освобождение буфера
void ReleaseVBO() {
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glDeleteBuffers(1, &VBO_pentagon);
    glDeleteBuffers(1, &VBO_cube);
    glDeleteBuffers(1, &VBO_square);
}

// Освобождение шейдеров
void ReleaseShader() {
    // Передавая ноль, мы отключаем шейдерную программу
    glUseProgram(0);
    // Удаляем шейдерную программу
    glDeleteProgram(Program);
    glDeleteProgram(Program1);
}

void Release() {
    // Шейдеры
    ReleaseShader();
    // Вершинный буфер
    ReleaseVBO();
}

int main() {
    sf::Window window(sf::VideoMode({ 600, 600 }), "My OpenGL window");
    window.setVerticalSyncEnabled(true);
    window.setActive(true);
    glewInit();
    Init();

    start_time = clock();

    while (window.isOpen()) {
        while (const std::optional event = window.pollEvent()) {
            if (event->is<sf::Event::Closed>()) { window.close(); break; }
        }
        if (!window.isOpen()) continue;
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        Draw();
        window.display();
    }
    Release();
    return 0;
}