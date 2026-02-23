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

// ID атрибута
GLint coordAttribID;
GLint colorAttribID;
GLint textureCoordAttribID;

GLint modelUniformID;
GLint textureUniformID;
GLint modeUniformID;

GLuint texture;

GLuint VBO;

time_t start_time;

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

struct TextureCoordinate {
    GLfloat x;
    GLfloat y;
};

struct VertexColor {
    Vertex v;
    Color c;
};

struct VertexColorTexture {
    Vertex v;
    Color c;
    TextureCoordinate t;
};

// Исходный код вершинного шейдера
const char* VertexShaderSource = R"(
 #version 330 core
 uniform mat4 model;

 in vec3 position;
 in vec3 color;
 in vec2 texCoord;
 out vec3 vertexColor; 
 out vec2 TexCoord; 

 void main() {
    gl_Position = model * vec4(position, 1.0f);
    vertexColor = color;
    TexCoord = vec2(texCoord.x, 1.0f - texCoord.y);
 }
)";

// Исходный код фрагментного шейдера
const char* FragShaderSource = R"(
 #version 330 core
 in vec3 vertexColor;
 in vec2 TexCoord;

 out vec4 color;

 uniform sampler2D ourTexture;
 uniform int mode;

 void main() {
    if (mode == 0){
        color = texture(ourTexture, TexCoord);
    } else if (mode == 1){
        color = vec4(vertexColor, 1.0f);
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
    glGenBuffers(1, &VBO);

    VertexColorTexture cube[36] = {
        // Front face (+Z) - Красный
        {{-1.0f, -1.0f, 1.0f}, {1.0f, 0.0f, 0.0f}, {0.0f, 0.0f}},
        {{-1.0f, 1.0f, 1.0f}, {1.0f, 0.0f, 0.0f}, {0.0f, 1.0f}},
        {{1.0f, 1.0f, 1.0f}, {1.0f, 0.0f, 0.0f}, {1.0f, 1.0f}},
        {{-1.0f, -1.0f, 1.0f}, {1.0f, 0.0f, 0.0f}, {0.0f, 0.0f}},
        {{1.0f, 1.0f, 1.0f}, {1.0f, 0.0f, 0.0f}, {1.0f, 1.0f}},
        {{1.0f, -1.0f, 1.0f}, {1.0f, 0.0f, 0.0f}, {1.0f, 0.0f}},

        // Back face (-Z) - Зеленый
        {{-1.0f, -1.0f, -1.0f}, {0.0f, 1.0f, 0.0f}, {0.0f, 0.0f}},
        {{1.0f, -1.0f, -1.0f}, {0.0f, 1.0f, 0.0f}, {1.0f, 0.0f}},
        {{1.0f, 1.0f, -1.0f}, {0.0f, 1.0f, 0.0f}, {1.0f, 1.0f}},
        {{-1.0f, -1.0f, -1.0f}, {0.0f, 1.0f, 0.0f}, {0.0f, 0.0f}},
        {{1.0f, 1.0f, -1.0f}, {0.0f, 1.0f, 0.0f}, {1.0f, 1.0f}},
        {{-1.0f, 1.0f, -1.0f}, {0.0f, 1.0f, 0.0f}, {0.0f, 1.0f}},

        // Left face (-X) - Синий
        {{-1.0f, -1.0f, -1.0f}, {0.0f, 0.0f, 1.0f}, {0.0f, 0.0f}},
        {{-1.0f, 1.0f, -1.0f}, {0.0f, 0.0f, 1.0f}, {0.0f, 1.0f}},
        {{-1.0f, 1.0f, 1.0f}, {0.0f, 0.0f, 1.0f}, {1.0f, 1.0f}},
        {{-1.0f, -1.0f, -1.0f}, {0.0f, 0.0f, 1.0f}, {0.0f, 0.0f}},
        {{-1.0f, 1.0f, 1.0f}, {0.0f, 0.0f, 1.0f}, {1.0f, 1.0f}},
        {{-1.0f, -1.0f, 1.0f}, {0.0f, 0.0f, 1.0f}, {1.0f, 0.0f}},

        // Right face (+X) - Желтый
        {{1.0f, -1.0f, -1.0f}, {1.0f, 1.0f, 0.0f}, {0.0f, 0.0f}},
        {{1.0f, -1.0f, 1.0f}, {1.0f, 1.0f, 0.0f}, {1.0f, 0.0f}},
        {{1.0f, 1.0f, 1.0f}, {1.0f, 1.0f, 0.0f}, {1.0f, 1.0f}},
        {{1.0f, -1.0f, -1.0f}, {1.0f, 1.0f, 0.0f}, {0.0f, 0.0f}},
        {{1.0f, 1.0f, 1.0f}, {1.0f, 1.0f, 0.0f}, {1.0f, 1.0f}},
        {{1.0f, 1.0f, -1.0f}, {1.0f, 1.0f, 0.0f}, {0.0f, 1.0f}},

        // Top face (+Y) - Голубой (Cyan)
        {{-1.0f, 1.0f, -1.0f}, {0.0f, 1.0f, 1.0f}, {0.0f, 0.0f}},
        {{-1.0f, 1.0f, 1.0f}, {0.0f, 1.0f, 1.0f}, {0.0f, 1.0f}},
        {{1.0f, 1.0f, 1.0f}, {0.0f, 1.0f, 1.0f}, {1.0f, 1.0f}},
        {{-1.0f, 1.0f, -1.0f}, {0.0f, 1.0f, 1.0f}, {0.0f, 0.0f}},
        {{1.0f, 1.0f, 1.0f}, {0.0f, 1.0f, 1.0f}, {1.0f, 1.0f}},
        {{1.0f, 1.0f, -1.0f}, {0.0f, 1.0f, 1.0f}, {1.0f, 0.0f}},

        // Bottom face (-Y) - Пурпурный (Magenta)
        {{-1.0f, -1.0f, -1.0f}, {1.0f, 0.0f, 1.0f}, {0.0f, 0.0f}},
        {{1.0f, -1.0f, -1.0f}, {1.0f, 0.0f, 1.0f}, {1.0f, 0.0f}},
        {{1.0f, -1.0f, 1.0f}, {1.0f, 0.0f, 1.0f}, {1.0f, 1.0f}},
        {{-1.0f, -1.0f, -1.0f}, {1.0f, 0.0f, 1.0f}, {0.0f, 0.0f}},
        {{1.0f, -1.0f, 1.0f}, {1.0f, 0.0f, 1.0f}, {1.0f, 1.0f}},
        {{-1.0f, -1.0f, 1.0f}, {1.0f, 0.0f, 1.0f}, {0.0f, 1.0f}}
    };

    // Передаем вершины в буфер
    glBindBuffer(GL_ARRAY_BUFFER, VBO);

    glBufferData(GL_ARRAY_BUFFER, sizeof(cube), cube, GL_STATIC_DRAW);

    glBindBuffer(GL_ARRAY_BUFFER, 0);
    checkOpenGLerror(); //Пример функции есть в лабораторной
    // Проверка ошибок OpenGL, если есть, то вывод в консоль тип ошибки
}

// Собираем шейдеры в программу
void InitShader() {
    // Создаем вершинный шейдер
    GLuint vShader = glCreateShader(GL_VERTEX_SHADER);
    // Передаем исходный код
    glShaderSource(vShader, 1, &VertexShaderSource, NULL);
    // Компилируем шейдер
    glCompileShader(vShader);
    std::cout << "vertex shader \n";
    // Функция печати лога шейдера
    ShaderLog(vShader); //Пример функции есть в лабораторной

    // Создаем фрагментный шейдер
    GLuint fShader = glCreateShader(GL_FRAGMENT_SHADER);
    // Передаем исходный код
    glShaderSource(fShader, 1, &FragShaderSource, NULL);
    // Компилируем шейдер
    glCompileShader(fShader);
    std::cout << "fragment shader \n";
    // Функция печати лога шейдера
    ShaderLog(fShader);

    // Создаем программу и прикрепляем шейдеры к ней
    Program = glCreateProgram();
    glAttachShader(Program, vShader);
    glAttachShader(Program, fShader);
    // Линкуем шейдерную программу
    glLinkProgram(Program);
    // Проверяем статус сборки
    int link_ok;
    glGetProgramiv(Program, GL_LINK_STATUS, &link_ok);
    if (!link_ok) {
        std::cout << "error attach shaders \n";
        return;
    }

    // Вытягиваем ID атрибута из собранной программы
    coordAttribID = glGetAttribLocation(Program, "position");
    colorAttribID = glGetAttribLocation(Program, "color");
    textureCoordAttribID = glGetAttribLocation(Program, "texCoord");

    modelUniformID = glGetUniformLocation(Program, "model");
    textureUniformID = glGetUniformLocation(Program, "ourTexture");
    modeUniformID = glGetUniformLocation(Program, "mode");


    checkOpenGLerror();
}


// Вызываем все инициализации и подгружаем текстуру
void Init() {
    // Шейдеры
    InitShader();
    // Вершинный буфер
    InitVBO();

    glEnable(GL_DEPTH_TEST);

    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

    int width, height;
    unsigned char* image = SOIL_load_image("88.png", &width, &height, 0, SOIL_LOAD_RGB);
    std::cout << SOIL_last_result() << std::endl;
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, width, height, 0, GL_RGB, GL_UNSIGNED_BYTE, image);

    glGenerateMipmap(GL_TEXTURE_2D);
    SOIL_free_image_data(image);
    glBindTexture(GL_TEXTURE_2D, 0);
}

// Отрисовка на каждом шаге
void Draw() {
    glUseProgram(Program); // Устанавливаем шейдерную программу текущей

    glm::mat4 model0 = glm::mat4(1.0f);
    model0 = glm::translate(model0, glm::vec3(0.5f, 0.0f, 0.0f));
    model0 = glm::scale(model0, glm::vec3(0.25f, 0.25f, 0.25f));
    model0 = glm::rotate(model0, (GLfloat)glm::radians((clock() - start_time) * 0.1f), glm::vec3(1.0f, 1.0f, 0.0f));
    glUniformMatrix4fv(modelUniformID, 1, GL_FALSE, glm::value_ptr(model0));
    glUniform1i(modeUniformID, 0);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, texture);
    glUniform1i(textureUniformID, 0);

    glBindBuffer(GL_ARRAY_BUFFER, VBO); // Подключаем VBO

    // сообщаем OpenGL как он должен интерпретировать вершинные данные.
    glEnableVertexAttribArray(coordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(coordAttribID, 3, GL_FLOAT, GL_FALSE, 32, (GLvoid*)0);

    glEnableVertexAttribArray(colorAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(colorAttribID, 3, GL_FLOAT, GL_FALSE, 32, (GLvoid*)12);
    checkOpenGLerror();

    glEnableVertexAttribArray(textureCoordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(textureCoordAttribID, 2, GL_FLOAT, GL_FALSE, 32, (GLvoid*)24);

    glBindBuffer(GL_ARRAY_BUFFER, 0); // Отключаем VBO
    glDrawArrays(GL_TRIANGLES, 0, 36); // Передаем данные на видеокарту(рисуем)

    //_______________________________________________________

    glm::mat4 model1 = glm::mat4(1.0f);
    model1 = glm::translate(model1, glm::vec3(-0.5f, 0.0f, 0.0f));
    model1 = glm::scale(model1, glm::vec3(0.25f, 0.25f, 0.25f));
    model1 = glm::rotate(model1, (GLfloat)glm::radians((clock() - start_time) * 0.1f), glm::vec3(-1.0f, -1.0f, 0.0f));
    glUniformMatrix4fv(modelUniformID, 1, GL_FALSE, glm::value_ptr(model1));
    glUniform1i(modeUniformID, 1);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, texture);
    glUniform1i(textureUniformID, 0);

    glBindBuffer(GL_ARRAY_BUFFER, VBO); // Подключаем VBO

    // сообщаем OpenGL как он должен интерпретировать вершинные данные.
    glEnableVertexAttribArray(coordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(coordAttribID, 3, GL_FLOAT, GL_FALSE, 32, (GLvoid*)0);

    glEnableVertexAttribArray(colorAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(colorAttribID, 3, GL_FLOAT, GL_FALSE, 32, (GLvoid*)12);
    checkOpenGLerror();

    glEnableVertexAttribArray(textureCoordAttribID); // Включаем массив атрибутов
    glVertexAttribPointer(textureCoordAttribID, 2, GL_FLOAT, GL_FALSE, 32, (GLvoid*)24);

    glBindBuffer(GL_ARRAY_BUFFER, 0); // Отключаем VBO
    glDrawArrays(GL_TRIANGLES, 0, 36); // Передаем данные на видеокарту(рисуем)

    glDisableVertexAttribArray(coordAttribID); // Отключаем массив атрибутов
    glDisableVertexAttribArray(textureCoordAttribID); // Отключаем массив атрибутов
    glDisableVertexAttribArray(colorAttribID); // Отключаем массив атрибутов

    glUseProgram(0); // Отключаем шейдерную программу

    checkOpenGLerror();
}

// Освобождение буфера
void ReleaseVBO() {
    glBindBuffer(GL_ARRAY_BUFFER, 0);
    glDeleteBuffers(1, &VBO);
}

// Освобождение шейдеров
void ReleaseShader() {
    // Передавая ноль, мы отключаем шейдерную программу
    glUseProgram(0);
    // Удаляем шейдерную программу
    glDeleteProgram(Program);
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